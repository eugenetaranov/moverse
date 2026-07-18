// NIIMBOT packet framing:  55 55 <type> <len> <data...> <checksum> AA AA
// checksum = type XOR len XOR each data byte. Ref: printers.niim.blue, niimprint.

export class NiimbotPacket {
  constructor(
    public readonly type: number,
    public readonly data: Uint8Array,
  ) {}

  toBytes(): Uint8Array {
    const len = this.data.length;
    let checksum = this.type ^ len;
    for (const b of this.data) checksum ^= b;
    const out = new Uint8Array(len + 7);
    out[0] = 0x55;
    out[1] = 0x55;
    out[2] = this.type;
    out[3] = len;
    out.set(this.data, 4);
    out[4 + len] = checksum & 0xff;
    out[5 + len] = 0xaa;
    out[6 + len] = 0xaa;
    return out;
  }
}

// Accumulates possibly-fragmented notification bytes and yields complete frames.
export class PacketReassembler {
  private buf: number[] = [];

  push(bytes: Uint8Array): NiimbotPacket[] {
    for (const b of bytes) this.buf.push(b);
    const out: NiimbotPacket[] = [];
    // Drop leading noise until a frame start.
    while (this.buf.length >= 7) {
      if (this.buf[0] !== 0x55 || this.buf[1] !== 0x55) {
        this.buf.shift();
        continue;
      }
      const len = this.buf[3];
      const frameLen = len + 7;
      if (this.buf.length < frameLen) break; // wait for more bytes
      const type = this.buf[2];
      const data = Uint8Array.from(this.buf.slice(4, 4 + len));
      out.push(new NiimbotPacket(type, data));
      this.buf.splice(0, frameLen);
    }
    return out;
  }
}
