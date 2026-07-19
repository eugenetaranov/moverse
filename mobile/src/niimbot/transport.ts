import { BleManager, Device } from "react-native-ble-plx";
import { fromByteArray, toByteArray } from "base64-js";
import { NiimbotPacket, PacketReassembler } from "./packet";

// Most NIIMBOT printers expose this service + a single WRITE_NO_RESPONSE/NOTIFY
// characteristic. Ref: printers.niim.blue.
const SERVICE = "e7810a71-73ae-499d-8c15-faa9aef0c3f2";
const CHAR = "bef8d6c9-9c21-4c9e-b632-bd58c1009f9f";

type Log = (s: string) => void;

// BLE transport over react-native-ble-plx. Connects by name match (the service
// is not always in the advertisement), streams notifications through the
// reassembler, and chunks writes to the negotiated MTU.
export class BleTransport {
  private manager: BleManager | null = null;
  private device: Device | null = null;
  private reasm = new PacketReassembler();
  private chunk = 20;
  private listeners: ((p: NiimbotPacket) => void)[] = [];
  onDisconnect?: () => void;

  constructor(private log: Log = () => {}) {}

  onPacket(cb: (p: NiimbotPacket) => void) {
    this.listeners.push(cb);
  }

  // nameMatch: substring to identify the printer (default matches B1/NIIMBOT).
  async connect(nameMatch = "b1"): Promise<string> {
    this.manager = new BleManager();
    const wanted = nameMatch.toLowerCase();

    const device = await new Promise<Device>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.manager?.stopDeviceScan();
        reject(new Error("scan timeout — printer not found"));
      }, 15000);
      this.manager!.startDeviceScan(null, { allowDuplicates: false }, (error, dev) => {
        if (error) {
          clearTimeout(timer);
          this.manager?.stopDeviceScan();
          reject(error);
          return;
        }
        const name = (dev?.name ?? dev?.localName ?? "").toLowerCase();
        if (dev && name && (name.includes(wanted) || name.includes("niimbot"))) {
          clearTimeout(timer);
          this.manager?.stopDeviceScan();
          resolve(dev);
        }
      });
    });
    this.log(`found ${device.name ?? device.localName ?? device.id}`);

    const connected = await device.connect({ requestMTU: 200 });
    await connected.discoverAllServicesAndCharacteristics();
    this.chunk = Math.max(20, (connected.mtu ?? 23) - 3);
    this.device = connected;
    this.log(`connected, mtu=${connected.mtu ?? "?"}`);

    // The B1 idle-powers-off (drops BLE). Track it so state doesn't go stale.
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

    return device.name ?? device.id;
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
    this.manager?.destroy();
    this.manager = null;
  }
}
