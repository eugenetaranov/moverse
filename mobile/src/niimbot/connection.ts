import { BleTransport, PrinterCandidate, ScanCancelledError, scanPrinters } from "./transport";
import { bleManager } from "./ble";
import { NiimbotClient } from "./client";
import { NiimbotModel, detectModel, modelById } from "./models";
import type { LabelSize } from "../labelSettings";
import {
  DEFAULT_ROLE,
  LabelKind,
  PrinterRole,
  RememberedPrinter,
  loadPrinterLabels,
  loadRememberedPrinters,
  loadRoles,
  loadTestedPrinters,
  roleCovers,
  savePrinterLabels,
  saveRememberedPrinters,
  saveRoles,
  saveTestedPrinters,
} from "./roles";

export { ScanCancelledError } from "./transport";

// One connected printer: its BLE link, print client, detected model, role, and
// its own label stock size.
export class ManagedPrinter {
  role: PrinterRole = DEFAULT_ROLE;
  labelSize: LabelSize;
  testPassed = false; // set once a test print completes without error (session only)
  constructor(
    public readonly id: string,
    public name: string,
    public model: NiimbotModel,
    public readonly transport: BleTransport,
    public readonly client: NiimbotClient,
  ) {
    this.labelSize = model.defaultLabel;
  }
}

type Listener = () => void;

// Manages the SET of connected printers (a BLE central can hold several links at
// once). Replaces the old single-connection singleton. Components subscribe to
// re-render; print paths resolve a printer by label kind via printerForKind.
class PrinterManager {
  private printers = new Map<string, ManagedPrinter>(); // live connections, by device id
  private remembered: RememberedPrinter[] = []; // persisted set (survives disconnect)
  private roles: Record<string, PrinterRole> = {};
  private labels: Record<string, LabelSize> = {};
  private tested = new Set<string>(); // ids that have ever passed a test print
  private loaded = false;
  private scanController: AbortController | null = null;
  log: (s: string) => void = () => {};
  private listeners = new Set<Listener>();
  private reconnecting = false;

  // Load persisted roles, label sizes, remembered set, and tested flags once.
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.roles = await loadRoles();
    this.labels = await loadPrinterLabels();
    this.remembered = await loadRememberedPrinters();
    this.tested = new Set(await loadTestedPrinters());
    this.loaded = true;
  }

  // Add/update a printer in the persisted remembered set.
  private async rememberUpsert(mp: ManagedPrinter): Promise<void> {
    const entry: RememberedPrinter = { id: mp.id, name: mp.name, model: mp.model.id };
    const i = this.remembered.findIndex((r) => r.id === mp.id);
    if (i >= 0) this.remembered[i] = entry;
    else this.remembered.push(entry);
    await saveRememberedPrinters(this.remembered);
  }

  // --- Observation ---------------------------------------------------------
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  // A per-printer log that prefixes lines with the device id so the UI can filter
  // the shared log stream down to one printer's traffic.
  private taggedLog(id: string): (s: string) => void {
    return (s: string) => this.log(`[${id}] ${s}`);
  }

  list(): ManagedPrinter[] {
    return [...this.printers.values()].sort((a, b) => a.id.localeCompare(b.id));
  }
  get count(): number {
    return this.printers.size;
  }
  // True if any printer is connected (kept for simple UI checks).
  get connected(): boolean {
    return this.printers.size > 0;
  }
  // Reconnect is in flight and there are remembered printers to bring back.
  get isReconnecting(): boolean {
    return this.reconnecting && this.remembered.length > 0;
  }
  hasRemembered(): boolean {
    return this.remembered.length > 0;
  }

  // --- Discovery / connection ---------------------------------------------
  get scanning(): boolean {
    return this.scanController !== null;
  }
  // Cancel an in-flight scan (the pending scan()/connectFirstAvailable rejects
  // with ScanCancelledError).
  cancelScan(): void {
    this.scanController?.abort();
  }

  // Current Bluetooth adapter state ("PoweredOn" / "PoweredOff" / …).
  bluetoothState(): Promise<string> {
    return bleManager().state();
  }

  // Scan and return only candidates that aren't already connected.
  async scanForNew(timeoutMs = 6000): Promise<PrinterCandidate[]> {
    const found = await this.scan(timeoutMs);
    return found.filter((c) => !this.printers.has(c.id));
  }

  async scan(timeoutMs = 6000): Promise<PrinterCandidate[]> {
    this.scanController = new AbortController();
    this.emit();
    try {
      return await scanPrinters(timeoutMs, this.log, this.scanController.signal);
    } finally {
      this.scanController = null;
      this.emit();
    }
  }

  // Connect an additional printer by device id without disturbing existing ones.
  async connectNew(deviceId: string, name?: string): Promise<ManagedPrinter> {
    await this.ensureLoaded();
    const existing = this.printers.get(deviceId);
    if (existing) return existing;
    const plog = this.taggedLog(deviceId);
    const t = new BleTransport(plog);
    // A drop removes only this printer from the set.
    t.onDisconnect = () => {
      if (this.printers.get(deviceId)?.transport === t) {
        this.printers.delete(deviceId);
        this.emit();
      }
    };
    const resolvedName = await t.connectById(deviceId);
    const client = new NiimbotClient(t, plog);
    // Confirm we're talking to a real printer (best-effort — don't drop a
    // working connection if the status reply is slow).
    try {
      plog((await client.ping()) ? "handshake ok" : "no handshake reply");
    } catch {
      // ignore — proceed; the print path will surface real failures
    }
    const model = detectModel(name ?? resolvedName);
    const mp = new ManagedPrinter(deviceId, name ?? resolvedName, model, t, client);
    mp.role = this.roles[deviceId] ?? DEFAULT_ROLE;
    mp.labelSize = this.labels[deviceId] ?? model.defaultLabel;
    mp.testPassed = this.tested.has(deviceId);
    this.printers.set(deviceId, mp);
    await this.rememberUpsert(mp);
    this.emit();
    return mp;
  }

  // Scan and connect the first printer that isn't already connected. Reconnect
  // by id proved unreliable in the field, so the "Connect" button always scans
  // ("connect as new") — the printer shows up in a scan and connects fast.
  async connectFirstAvailable(): Promise<ManagedPrinter> {
    const found = await this.scan();
    const next = found.find((c) => !this.printers.has(c.id));
    if (!next) throw new Error("no new printer found");
    return this.connectNew(next.id, next.name);
  }

  // Tear down the live connection but KEEP the printer remembered, so it
  // auto-reconnects next launch. Non-destructive.
  async disconnect(id: string): Promise<void> {
    const mp = this.printers.get(id);
    if (!mp) return;
    try {
      await mp.transport.disconnect();
    } catch {
      // ignore
    }
    this.printers.delete(id);
    this.emit();
  }

  async disconnectAll(): Promise<void> {
    for (const id of [...this.printers.keys()]) await this.disconnect(id);
  }

  // Disconnect AND drop the printer from the remembered set + its saved role /
  // label / tested flag, so it won't auto-reconnect. Destructive.
  async forget(id: string): Promise<void> {
    await this.ensureLoaded();
    this.remembered = this.remembered.filter((r) => r.id !== id);
    await saveRememberedPrinters(this.remembered);
    delete this.roles[id];
    await saveRoles(this.roles);
    delete this.labels[id];
    await savePrinterLabels(this.labels);
    if (this.tested.delete(id)) await saveTestedPrinters([...this.tested]);
    await this.disconnect(id);
  }

  // --- Roles ---------------------------------------------------------------
  setRole(id: string, role: PrinterRole): void {
    const mp = this.printers.get(id);
    if (mp) mp.role = role;
    this.roles[id] = role;
    void saveRoles(this.roles);
    this.emit();
  }

  // Mark that a printer completed a test print without error — persisted so the
  // QR-content gate stays unlocked across restarts.
  markTested(id: string): void {
    const mp = this.printers.get(id);
    if (mp) mp.testPassed = true;
    if (!this.tested.has(id)) {
      this.tested.add(id);
      void saveTestedPrinters([...this.tested]);
    }
    this.emit();
  }

  // --- Per-printer label size ---------------------------------------------
  setLabelSize(id: string, size: LabelSize): void {
    const mp = this.printers.get(id);
    if (mp) mp.labelSize = size;
    this.labels[id] = size;
    void savePrinterLabels(this.labels);
    this.emit();
  }

  // --- Routing -------------------------------------------------------------
  // Resolve a label kind to the printer that should print it: a printer whose
  // role equals the kind wins over an "any" printer; ties are broken by lowest
  // device id (list() is id-sorted) so the same job always routes the same way.
  // null → no coverage.
  printerForKind(kind: LabelKind): ManagedPrinter | null {
    const conn = this.list();
    const exact = conn.find((p) => p.role === kind);
    if (exact) return exact;
    const any = conn.find((p) => p.role === "any");
    return any ?? null;
  }

  // Kinds with no connected printer covering them (for coverage hints).
  uncoveredKinds(): LabelKind[] {
    const kinds: LabelKind[] = ["item", "box"];
    return kinds.filter((k) => !this.list().some((p) => roleCovers(p.role, k)));
  }

  // --- Reconnect ----------------------------------------------------------
  // Attempt to reconnect the remembered set (by device id, no scan — works even
  // when the printer isn't advertising). Returns how many were (re)connected.
  // Used both for the background reconnect on launch and the foreground
  // "Connect" button, which tries this before scanning for a new printer.
  async reconnectRemembered(): Promise<number> {
    if (this.reconnecting) return 0;
    await this.ensureLoaded();
    if (this.remembered.length === 0) return 0;
    this.reconnecting = true;
    this.emit();
    let connected = 0;
    try {
      for (const r of this.remembered) {
        if (this.printers.has(r.id)) continue;
        try {
          const plog = this.taggedLog(r.id);
          const t = new BleTransport(plog);
          t.onDisconnect = () => {
            if (this.printers.get(r.id)?.transport === t) {
              this.printers.delete(r.id);
              this.emit();
            }
          };
          await t.connectById(r.id);
          const client = new NiimbotClient(t, plog);
          const model = modelById(r.model);
          const mp = new ManagedPrinter(r.id, r.name, model, t, client);
          mp.role = this.roles[r.id] ?? DEFAULT_ROLE;
          mp.labelSize = this.labels[r.id] ?? model.defaultLabel;
          mp.testPassed = this.tested.has(r.id);
          this.printers.set(r.id, mp);
          this.emit();
          connected++;
        } catch (e) {
          this.log(`reconnect ${r.name} failed: ${String((e as Error)?.message ?? e)}`);
        }
      }
    } finally {
      this.reconnecting = false;
      this.emit();
    }
    return connected;
  }
}

export const printers = new PrinterManager();
