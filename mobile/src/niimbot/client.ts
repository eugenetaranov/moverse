import { BleTransport } from "./transport";
import { NiimbotPacket } from "./packet";

// NIIMBOT request opcodes (from niimbluelib commands.ts).
const T = {
  SET_DENSITY: 0x21,
  SET_LABEL_TYPE: 0x23,
  SET_PAGE_SIZE: 0x13,
  PRINT_START: 0x01,
  PRINT_END: 0xf3,
  PAGE_START: 0x03,
  PAGE_END: 0xe3,
  BITMAP_ROW: 0x85,
  BITMAP_ROW_INDEXED: 0x83,
  EMPTY_ROW: 0x84,
  GET_STATUS: 0xa3,
} as const;
const RESP_STATUS = 0xb3; // In_PrintStatus
const HEAD_PX = 384; // B1 printhead width

export interface Bitmap {
  width: number; // px, multiple of 8, <= 384
  height: number; // px
  data: Uint8Array; // 1bpp, MSB-first, ceil(width/8) bytes/row, black = 1
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const u16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];

// Per-third black-pixel counts the printer needs in each row packet (mirrors
// niimbluelib countPixelsForBitmapPacket "auto"). Sending 0s here makes the B1
// render the row blank.
function countParts(row: Uint8Array): { total: number; parts: number[] } {
  let total = 0;
  const parts = [0, 0, 0];
  const chunkSize = Math.floor(HEAD_PX / 8 / 3); // 16 bytes
  const split = row.length <= chunkSize * 3;
  row.forEach((value, byteN) => {
    const chunkIdx = Math.floor(byteN / chunkSize);
    for (let bitN = 0; bitN < 8; bitN++) {
      if (value & (1 << bitN)) {
        total++;
        if (split && chunkIdx <= 2) parts[chunkIdx]++;
      }
    }
  });
  return split ? { total, parts } : { total, parts: [0, total & 0xff, (total >> 8) & 0xff] };
}

// Positions of set pixels (u16 each), MSB-first — for the sparse indexed packet.
function indexPixels(row: Uint8Array): number[] {
  const out: number[] = [];
  for (let bytePos = 0; bytePos < row.length; bytePos++) {
    const b = row[bytePos];
    for (let bitPos = 0; bitPos < 8; bitPos++) {
      if (b & (1 << (7 - bitPos))) out.push(...u16(bytePos * 8 + bitPos));
    }
  }
  return out;
}

// B1 (203 dpi) print client over a BLE transport.
export class NiimbotClient {
  private waiters: Array<{ type: number; resolve: (p: NiimbotPacket) => void }> = [];
  private aborted = false;

  cancel() {
    this.aborted = true;
  }

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
    await sleep(15);
  }
  private write(type: number, data: number[]): Promise<void> {
    return this.t.write(new NiimbotPacket(type, Uint8Array.from(data)).toBytes());
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

  async printImage(img: Bitmap, density = 3, labelType = 1): Promise<void> {
    this.aborted = false;
    const bpr = Math.ceil(img.width / 8);
    const totalPages = 1;

    // Init (B1 flow): density, label type, printStart7b(totalPages, color).
    await this.send(T.SET_DENSITY, [density]);
    await this.send(T.SET_LABEL_TYPE, [labelType]);
    await this.send(T.PRINT_START, [...u16(totalPages), 0, 0, 0, 0, 0]);
    // Page: pageStart, setPageSize6b(rows, cols, copies), rows…, pageEnd.
    await this.send(T.PAGE_START, [1]);
    await this.send(T.SET_PAGE_SIZE, [...u16(img.height), ...u16(img.width), ...u16(1)]);

    let y = 0;
    while (y < img.height) {
      if (this.aborted) throw new Error("cancelled");
      const row = img.data.subarray(y * bpr, (y + 1) * bpr);
      let isVoid = true;
      for (let i = 0; i < row.length; i++)
        if (row[i]) {
          isVoid = false;
          break;
        }
      // Merge identical consecutive rows into one packet's repeat count.
      let repeat = 1;
      while (y + repeat < img.height) {
        const next = img.data.subarray((y + repeat) * bpr, (y + repeat + 1) * bpr);
        let same = true;
        for (let i = 0; i < bpr; i++)
          if (row[i] !== next[i]) {
            same = false;
            break;
          }
        if (!same) break;
        repeat++;
      }

      if (isVoid) {
        await this.write(T.EMPTY_ROW, [...u16(y), repeat]);
      } else {
        const { total, parts } = countParts(row);
        if (total <= 6) {
          await this.write(T.BITMAP_ROW_INDEXED, [...u16(y), ...parts, repeat, ...indexPixels(row)]);
        } else {
          await this.write(T.BITMAP_ROW, [...u16(y), ...parts, repeat, ...row]);
        }
      }
      const prev = y;
      y += repeat;
      await sleep(3); // pace the BLE queue + yield to the UI
      if (Math.floor(prev / 64) !== Math.floor(y / 64)) this.log(`row ${y}/${img.height}`);
    }
    this.log(`sent ${img.height} rows`);

    await this.send(T.PAGE_END, [1]);
    for (let i = 0; i < 40; i++) {
      if (this.aborted) throw new Error("cancelled");
      await this.send(T.GET_STATUS, [1]);
      const resp = await this.waitFor(RESP_STATUS, 400);
      if (resp) {
        this.log(`status: [${Array.from(resp.data).join(",")}]`);
        break;
      }
      await sleep(150);
    }
    await this.send(T.PRINT_END, [1]);
    this.log("print done");
  }
}
