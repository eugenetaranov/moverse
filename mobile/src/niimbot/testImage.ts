import type { Bitmap } from "./client";

// A recognizable 1bpp test pattern (border + diagonals + a filled block) sized
// to the actual label, so the printed area feeds fully out of the mechanism.
export function makeTestImage(width = 384, height = 240): Bitmap {
  width = Math.min(Math.max(8, width), 384);
  height = Math.max(8, height);
  const bytesPerRow = Math.ceil(width / 8);
  const data = new Uint8Array(bytesPerRow * height);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
  };

  // border (3px)
  for (let x = 0; x < width; x++)
    for (let t = 0; t < 3; t++) {
      set(x, t);
      set(x, height - 1 - t);
    }
  for (let y = 0; y < height; y++)
    for (let t = 0; t < 3; t++) {
      set(t, y);
      set(width - 1 - t, y);
    }
  // crossing diagonals across the full label
  const steps = Math.max(width, height);
  for (let i = 0; i < steps; i++) {
    const x = Math.round((i / steps) * (width - 1));
    const y = Math.round((i / steps) * (height - 1));
    set(x, y);
    set(width - 1 - x, y);
  }
  // filled centre block
  const bw = Math.round(width * 0.2);
  const bh = Math.round(height * 0.2);
  const cx = Math.round(width / 2);
  const cy = Math.round(height / 2);
  for (let y = cy - bh; y < cy + bh; y++) for (let x = cx - bw; x < cx + bw; x++) set(x, y);

  return { width, height, data };
}
