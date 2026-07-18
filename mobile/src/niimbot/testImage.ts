import type { Bitmap } from "./client";

// A recognizable 1bpp test pattern (border + diagonals + a filled block) to
// prove the printer renders our bitmap correctly. 384px = full B1 head width.
export function makeTestImage(): Bitmap {
  const width = 384;
  const height = 96;
  const bytesPerRow = width / 8; // 48
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
  // crossing diagonals
  for (let i = 0; i < Math.min(width, height); i++) {
    set(i, i);
    set(width - 1 - i, i);
  }
  // filled centre block
  for (let y = 30; y < 66; y++) for (let x = 160; x < 224; x++) set(x, y);

  return { width, height, data };
}
