import { BleTransport } from "./transport";
import { NiimbotClient } from "./client";

// App-level printer connection so both Settings and the hub print through one
// BLE link (BLE allows a single connection at a time). Simple observable
// singleton — components subscribe to re-render on connect/disconnect.
type Listener = () => void;

class PrinterConnection {
  private transport: BleTransport | null = null;
  client: NiimbotClient | null = null;
  name: string | null = null;
  log: (s: string) => void = () => {};
  private listeners = new Set<Listener>();

  get connected(): boolean {
    return this.client !== null;
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
  private emit() {
    for (const l of this.listeners) l();
  }

  async connect(nameMatch = "b1"): Promise<string> {
    const t = new BleTransport(this.log);
    const name = await t.connect(nameMatch);
    this.transport = t;
    this.client = new NiimbotClient(t, this.log);
    this.name = name;
    this.emit();
    return name;
  }

  async disconnect(): Promise<void> {
    try {
      await this.transport?.disconnect();
    } catch {
      // ignore
    }
    this.transport = null;
    this.client = null;
    this.name = null;
    this.emit();
  }
}

export const printer = new PrinterConnection();
