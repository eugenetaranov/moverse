import { BleTransport, PrinterCandidate, ScanCancelledError, scanPrinters } from "./transport";
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
  roleCovers,
  savePrinterLabels,
  saveRememberedPrinters,
  saveRoles,
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
  private printers = new Map<string, ManagedPrinter>(); // by device id
  private roles: Record<string, PrinterRole> = {};
  private labels: Record<string, LabelSize> = {};
  private loaded = false;
  private scanController: AbortController | null = null;
  log: (s: string) => void = () => {};
  private listeners = new Set<Listener>();
  private reconnecting = false;

  // Load persisted roles + per-printer label sizes once.
  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.roles = await loadRoles();
    this.labels = await loadPrinterLabels();
    this.loaded = true;
  }

  // --- Observation ---------------------------------------------------------
  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
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

  // --- Discovery / connection ---------------------------------------------
  get scanning(): boolean {
    return this.scanController !== null;
  }
  // Cancel an in-flight scan (the pending scan()/connectFirstAvailable rejects
  // with ScanCancelledError).
  cancelScan(): void {
    this.scanController?.abort();
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
    const t = new BleTransport(this.log);
    // A drop removes only this printer from the set.
    t.onDisconnect = () => {
      if (this.printers.get(deviceId)?.transport === t) {
        this.printers.delete(deviceId);
        this.emit();
      }
    };
    const resolvedName = await t.connectById(deviceId);
    const client = new NiimbotClient(t, this.log);
    const model = detectModel(name ?? resolvedName);
    const mp = new ManagedPrinter(deviceId, name ?? resolvedName, model, t, client);
    mp.role = this.roles[deviceId] ?? DEFAULT_ROLE;
    mp.labelSize = this.labels[deviceId] ?? model.defaultLabel;
    this.printers.set(deviceId, mp);
    await this.remember();
    this.emit();
    return mp;
  }

  // Scan and connect the first printer that isn't already connected. Convenience
  // for the single-printer "Connect" button.
  async connectFirstAvailable(): Promise<ManagedPrinter> {
    const found = await this.scan();
    const next = found.find((c) => !this.printers.has(c.id));
    if (!next) throw new Error("no new printer found");
    return this.connectNew(next.id, next.name);
  }

  async disconnect(id: string): Promise<void> {
    const mp = this.printers.get(id);
    if (!mp) return;
    try {
      await mp.transport.disconnect();
    } catch {
      // ignore
    }
    this.printers.delete(id);
    await this.remember();
    this.emit();
  }

  async disconnectAll(): Promise<void> {
    for (const id of [...this.printers.keys()]) await this.disconnect(id);
  }

  // Disconnect and drop from the remembered set so it won't auto-reconnect.
  async forget(id: string): Promise<void> {
    delete this.roles[id];
    await saveRoles(this.roles);
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

  // Mark that a printer completed a test print without error (session state).
  markTested(id: string): void {
    const mp = this.printers.get(id);
    if (mp && !mp.testPassed) {
      mp.testPassed = true;
      this.emit();
    }
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

  // --- Persistence / reconnect --------------------------------------------
  private async remember(): Promise<void> {
    const list: RememberedPrinter[] = this.list().map((p) => ({
      id: p.id,
      name: p.name,
      model: p.model.id,
    }));
    await saveRememberedPrinters(list);
  }

  // Restore roles + attempt to reconnect the remembered set in the background.
  async reconnectRemembered(): Promise<void> {
    if (this.reconnecting) return;
    this.reconnecting = true;
    try {
      await this.ensureLoaded();
      const remembered = await loadRememberedPrinters();
      for (const r of remembered) {
        if (this.printers.has(r.id)) continue;
        try {
          const t = new BleTransport(this.log);
          t.onDisconnect = () => {
            if (this.printers.get(r.id)?.transport === t) {
              this.printers.delete(r.id);
              this.emit();
            }
          };
          await t.connectById(r.id);
          const client = new NiimbotClient(t, this.log);
          const model = modelById(r.model);
          const mp = new ManagedPrinter(r.id, r.name, model, t, client);
          mp.role = this.roles[r.id] ?? DEFAULT_ROLE;
          mp.labelSize = this.labels[r.id] ?? model.defaultLabel;
          this.printers.set(r.id, mp);
          this.emit();
        } catch (e) {
          this.log(`reconnect ${r.name} failed: ${String((e as Error)?.message ?? e)}`);
        }
      }
    } finally {
      this.reconnecting = false;
    }
  }
}

export const printers = new PrinterManager();
