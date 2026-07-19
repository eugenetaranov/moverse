import { Device } from "react-native-ble-plx";
import { fromByteArray, toByteArray } from "base64-js";
import { NiimbotPacket, PacketReassembler } from "./packet";
import { bleManager } from "./ble";
import { isNiimbotName } from "./models";

// Most NIIMBOT printers expose this service + a single WRITE_NO_RESPONSE/NOTIFY
// characteristic. Ref: printers.niim.blue.
const SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

type Log = (s: string) => void;

// A printer found during a scan.
export interface PrinterCandidate {
  id: string; // BLE peripheral / address — stable key
  name: string;
  rssi: number; // signal strength; higher (closer to 0) is stronger
}

// Scan for Niimbot printers and return the candidate set (deduped by id, sorted
// by RSSI strongest-first) instead of grabbing the first match. Uses the shared
// BleManager so it composes with already-connected printers.
export class ScanCancelledError extends Error {
  constructor() {
    super("scan cancelled");
    this.name = "ScanCancelledError";
  }
}

export async function scanPrinters(
  timeoutMs = 6000,
  log: Log = () => {},
  signal?: AbortSignal,
): Promise<PrinterCandidate[]> {
  const mgr = bleManager();
  const found = new Map<string, PrinterCandidate>();
  return new Promise<PrinterCandidate[]>((resolve, reject) => {
    const cleanup = () => {
      clearTimeout(timer);
      mgr.stopDeviceScan();
      signal?.removeEventListener("abort", onAbort);
    };
    const finish = () => {
      cleanup();
      resolve([...found.values()].sort((a, b) => b.rssi - a.rssi));
    };
    const onAbort = () => {
      cleanup();
      reject(new ScanCancelledError());
    };
    if (signal?.aborted) {
      reject(new ScanCancelledError());
      return;
    }
    const timer = setTimeout(finish, timeoutMs);
    signal?.addEventListener("abort", onAbort);
    // Scan all services (Niimbot printers don't reliably advertise the service
    // in the ad packet), then accept a device if its name is an anchored Niimbot
    // match OR it advertises our service UUID — robust to renamed printers
    // without missing ones whose ad packet omits the service.
    mgr.startDeviceScan(null, { allowDuplicates: false }, (error, dev) => {
      if (error) {
        cleanup();
        reject(error);
        return;
      }
      if (!dev) return;
      const name = dev.name ?? dev.localName ?? "";
      const advertisesService = (dev.serviceUUIDs ?? []).some((u) => u.toLowerCase() === SERVICE.toLowerCase());
      if (isNiimbotName(name) || advertisesService) {
        if (!found.has(dev.id)) log(`found ${name || dev.id}`);
        found.set(dev.id, { id: dev.id, name: name || dev.id, rssi: dev.rssi ?? -999 });
      }
    });
  });
}

// BLE transport over react-native-ble-plx. Streams notifications through the
// reassembler and chunks writes to the negotiated MTU. One transport per printer.
export class BleTransport {
  private device: Device | null = null;
  private reasm = new PacketReassembler();
  private chunk = 20;
  private listeners: ((p: NiimbotPacket) => void)[] = [];
  onDisconnect?: () => void;

  constructor(private log: Log = () => {}) {}

  onPacket(cb: (p: NiimbotPacket) => void) {
    this.listeners.push(cb);
  }

  // Connect to a specific, already-discovered device by its BLE id. Used by the
  // manager to add printers one at a time without disturbing existing ones.
  async connectById(deviceId: string): Promise<string> {
    const mgr = bleManager();
    const connected = await mgr.connectToDevice(deviceId, { requestMTU: 200 });
    return this.attach(connected);
  }

  // nameMatch: substring to identify the printer (default matches B1/NIIMBOT).
  // Legacy first-match connect, retained for callers that don't pick a device.
  async connect(nameMatch = "b1"): Promise<string> {
    const mgr = bleManager();
    const wanted = nameMatch.toLowerCase();

    const device = await new Promise<Device>((resolve, reject) => {
      const timer = setTimeout(() => {
        mgr.stopDeviceScan();
        reject(new Error("scan timeout — printer not found"));
      }, 15000);
      mgr.startDeviceScan(null, { allowDuplicates: false }, (error, dev) => {
        if (error) {
          clearTimeout(timer);
          mgr.stopDeviceScan();
          reject(error);
          return;
        }
        const name = (dev?.name ?? dev?.localName ?? "").toLowerCase();
        if (dev && name && (name.includes(wanted) || name.includes("niimbot"))) {
          clearTimeout(timer);
          mgr.stopDeviceScan();
          resolve(dev);
        }
      });
    });
    this.log(`found ${device.name ?? device.localName ?? device.id}`);
    const connected = await device.connect({ requestMTU: 200 });
    return this.attach(connected);
  }

  // Finish setup on a connected device: discover services, size the MTU chunk,
  // wire disconnect + notifications. Shared by connect() and connectById().
  private async attach(connected: Device): Promise<string> {
    await connected.discoverAllServicesAndCharacteristics();
    this.chunk = Math.max(20, (connected.mtu ?? 23) - 3);
    this.device = connected;
    this.log(`connected, mtu=${connected.mtu ?? "?"}`);

    // Niimbot printers idle-power-off (drop BLE). Track it so state doesn't go stale.
    connected.onDisconnected(() => {
      this.log("printer disconnected");
      this.device = null;
      this.onDisconnect?.();
    });

    connected.monitorCharacteristicForService(SERVICE, CHAR, (error, char) => {
      if (error) {
        this.log(`notify error: ${error.message}`);
        return;
      }
      if (!char?.value) return;
      const bytes = toByteArray(char.value);
      for (const pkt of this.reasm.push(bytes)) {
        this.log(`<- 0x${pkt.type.toString(16)} [${Array.from(pkt.data).join(",")}]`);
        for (const cb of this.listeners) cb(pkt);
      }
    });

    return connected.name ?? connected.id;
  }

  get deviceId(): string | null {
    return this.device?.id ?? null;
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.device) throw new Error("not connected");
    for (let i = 0; i < bytes.length; i += this.chunk) {
      const slice = bytes.subarray(i, i + this.chunk);
      await this.device.writeCharacteristicWithoutResponseForService(
        SERVICE,
        CHAR,
        fromByteArray(slice),
      );
    }
  }

  // Acknowledged write — the peripheral confirms each write, giving guaranteed
  // delivery + flow control for bulk image data. Throws if the characteristic
  // doesn't support write-with-response (caller falls back to write()).
  async writeAck(bytes: Uint8Array): Promise<void> {
    if (!this.device) throw new Error("not connected");
    for (let i = 0; i < bytes.length; i += this.chunk) {
      const slice = bytes.subarray(i, i + this.chunk);
      await this.device.writeCharacteristicWithResponseForService(SERVICE, CHAR, fromByteArray(slice));
    }
  }

  async disconnect(): Promise<void> {
    try {
      if (this.device) await this.device.cancelConnection();
    } catch {
      // ignore
    }
    this.device = null;
    // The BleManager is shared app-wide (other printers may use it) — don't destroy it.
  }
}
