import { BleTransport } from "./transport";
import { NiimbotPacket } from "./packet";

// NIIMBOT request packet types (subset needed to print). Ref: niimprint.
const T = {
  SET_DENSITY: 0x21,
  SET_LABEL_TYPE: 0x23,
  START_PRINT: 0x01,
  END_PRINT: 0xf3,
  START_PAGE: 0x03,
  END_PAGE: 0xe3,
  SET_DIMENSION: 0x13,
  SET_QUANTITY: 0x15,
  GET_STATUS: 0xa3,
  IMAGE_ROW: 0x85,
} as const;
const RESP_STATUS = 0xb3;

export interface Bitmap {
  width: number; // px (<= 384 for B1)
  height: number; // px
  data: Uint8Array; // 1bpp, MSB-first, ceil(width/8) bytes per row, black = 1
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Minimal B1 (203 dpi) print client over a BLE transport. Commands are mostly
// fire-and-forget with short delays; the final print status is polled.
export class NiimbotClient {
  private waiters: Array<{ type: number; resolve: (p: NiimbotPacket) => void }> = [];

  constructor(
    private t: BleTransport,
    private log: (s: string) => void = () => {},
  ) {
    t.onPacket((p) => {
      for (let i = this.waiters.length - 1; i >= 0; i--) {
        if (this.waiters[i].type === p.type) {
          this.waiters[i].resolve(p);
          this.waiters.splice(i, 1);
        }
      }
    });
  }

  private async send(type: number, data: number[]): Promise<void> {
    this.log(`-> 0x${type.toString(16)} [${data.join(",")}]`);
    await this.t.write(new NiimbotPacket(type, Uint8Array.from(data)).toBytes());
  }

  private waitFor(type: number, timeoutMs: number): Promise<NiimbotPacket | null> {
    return new Promise((resolve) => {
      const w = { type, resolve: (p: NiimbotPacket) => resolve(p) };
      this.waiters.push(w);
      setTimeout(() => {
        const i = this.waiters.indexOf(w);
        if (i >= 0) this.waiters.splice(i, 1);
        resolve(null);
      }, timeoutMs);
    });
  }

  async printImage(img: Bitmap, density = 3, quantity = 1): Promise<void> {
    const bytesPerRow = Math.ceil(img.width / 8);

    await this.send(T.SET_DENSITY, [density]);
    await sleep(20);
    await this.send(T.SET_LABEL_TYPE, [1]);
    await sleep(20);
    await this.send(T.START_PRINT, [0x01]);
    await sleep(20);
    await this.send(T.START_PAGE, [0x01]);
    await sleep(20);
    await this.send(T.SET_DIMENSION, [(img.height >> 8) & 0xff, img.height & 0xff, (img.width >> 8) & 0xff, img.width & 0xff]);
    await sleep(20);
    await this.send(T.SET_QUANTITY, [(quantity >> 8) & 0xff, quantity & 0xff]);
    await sleep(20);

    for (let y = 0; y < img.height; y++) {
      const row = img.data.subarray(y * bytesPerRow, (y + 1) * bytesPerRow);
      // header: 2-byte row index, 3 count bytes (0 works), 1 repeat count
      const header = [(y >> 8) & 0xff, y & 0xff, 0, 0, 0, 1];
      const payload = new NiimbotPacket(
        T.IMAGE_ROW,
        Uint8Array.from([...header, ...row]),
      ).toBytes();
      await this.t.write(payload);
    }
    this.log(`sent ${img.height} rows`);

    await sleep(200);
    await this.send(T.END_PAGE, [0x01]);

    // Poll status until the page prints (best effort).
    for (let i = 0; i < 20; i++) {
      await this.send(T.GET_STATUS, [0x01]);
      const resp = await this.waitFor(RESP_STATUS, 500);
      if (resp) {
        this.log(`status: [${Array.from(resp.data).join(",")}]`);
        break;
      }
      await sleep(200);
    }

    await this.send(T.END_PRINT, [0x01]);
    this.log("print done");
  }
}
