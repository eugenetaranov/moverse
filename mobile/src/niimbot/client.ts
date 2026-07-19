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
// Command -> its ack response, so setup commands can be gated in order.
const RESP_MAP: Record<number, number> = {
  0x21: 0x31, // density
  0x23: 0x33, // label type
  0x01: 0x02, // print start
  0x03: 0x04, // page start
  0x13: 0x14, // page size
  0xe3: 0xe4, // page end
  0xf3: 0xf4, // print end
};
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

  // Send a command and (if it has a mapped response) wait for its ack before
  // returning, so the B1 processes the setup commands strictly in order. Waiter
  // is registered before the write to avoid missing a fast response.
  private async send(type: number, data: number[]): Promise<void> {
    const respType = RESP_MAP[type];
    const ackP = respType !== undefined ? this.waitFor(respType, 1500) : null;
    this.log(`-> 0x${type.toString(16)} [${data.join(",")}]`);
    await this.t.write(new NiimbotPacket(type, Uint8Array.from(data)).toBytes());
    if (ackP) {
      if (!(await ackP)) this.log(`  (no ack for 0x${type.toString(16)})`);
    } else {
      await sleep(10);
    }
  }

  // Send and return the response promise (waiter registered first).
  private sendRecv(type: number, data: number[], respType: number, timeoutMs: number): Promise<NiimbotPacket | null> {
    const p = this.waitFor(respType, timeoutMs);
    this.log(`-> 0x${type.toString(16)} [${data.join(",")}]`);
    void this.t.write(new NiimbotPacket(type, Uint8Array.from(data)).toBytes());
    return p;
  }
  // Image-row write: prefer acknowledged (guaranteed delivery + flow control);
  // fall back to no-response if the characteristic doesn't support it.
  private ackMode: "unknown" | "ack" | "noack" = "unknown";
  private async write(type: number, data: number[]): Promise<void> {
    const bytes = new NiimbotPacket(type, Uint8Array.from(data)).toBytes();
    if (this.ackMode !== "noack") {
      try {
        await this.t.writeAck(bytes);
        if (this.ackMode === "unknown") {
          this.ackMode = "ack";
          this.log("(rows: write-with-response)");
        }
        return;
      } catch {
        if (this.ackMode === "unknown") {
          this.ackMode = "noack";
          this.log("(with-response unsupported → no-response)");
        }
      }
    }
    await this.t.write(bytes);
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
    this.ackMode = "unknown";
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
      // Merge identical consecutive rows into one packet's repeat count. The
      // repeat is a single byte, so cap at 255 — >255 truncates to 0 (invalid
      // packet) and the print stops partway.
      let repeat = 1;
      while (y + repeat < img.height && repeat < 255) {
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
      if (Math.floor(prev / 64) !== Math.floor(y / 64)) this.log(`row ${y}/${img.height}`);
    }
    this.log(`sent ${img.height} rows`);

    await this.send(T.PAGE_END, [1]);

    // Wait for the printer to PHYSICALLY finish (page count reaches totalPages).
    // Printing 80mm takes seconds — ending the job before this aborts the print.
    let printed = 0;
    for (let i = 0; i < 80; i++) {
      if (this.aborted) throw new Error("cancelled");
      const resp = await this.sendRecv(T.GET_STATUS, [1], RESP_STATUS, 500);
      if (resp) {
        const d = resp.data;
        const page = (d[0] << 8) | d[1];
        const err = d.length >= 10 ? d[6] : 0;
        this.log(`status: page ${page}/${totalPages} prog ${d[2]}/${d[3]}${err ? ` ERR ${err}` : ""}`);
        if (err) throw new Error(`print error ${err}`);
        printed = page;
        if (page >= totalPages) break;
      }
      await sleep(250);
    }
    this.log(printed >= totalPages ? "printed ✓" : "print timed out (page not reached)");

    await this.send(T.PRINT_END, [1]);
    this.log("print done");
  }
}
