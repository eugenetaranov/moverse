import { toByteArray } from "base64-js";

// Classic 5x8 GLCD bitmap font (Adafruit, public domain), printable ASCII
// 0x20–0x7E. Column-major: 5 bytes per glyph, each byte = 8 vertical pixels
// with bit 0 = top row. Covers letters, digits, and punctuation so arbitrary
// label text (codes AND free text like phone / address) renders.
const FONT = toByteArray(
  "AAAAAAAAAF8AAAAHAAcAFH8UfxQkKn8qEiMTCGRiNklWIFAACAcDAAAcIkEAAEEiHAAqHH8cKggIPggIAIBwMAAICAgICAAAYGAAIBAIBAI+UUlFPgBCf0AAcklJSUYhQUlNMxgUEn8QJ0VFRTk8SklJMUEhEQkHNklJSTZGSUkpHgAAFAAAAEA0AAAACBQiQRQUFBQUAEEiFAgCAVkJBj5BXVlOfBIREnx/SUlJNj5BQUEif0FBQT5/SUlJQX8JCQkBPkFBUXN/CAgIfwBBf0EAIEBBPwF/CBQiQX9AQEBAfwIcAn9/BAgQfz5BQUE+fwkJCQY+QVEhXn8JGSlGJklJSTIDAX8BAz9AQEA/HyBAIB8/QDhAP2MUCBRjAwR4BANhWUlNQwB/QUFBAgQIECAAQUFBfwQCAQIEQEBAQEAAAwcIACBUVHhAfyhERDg4REREKDhERCh/OFRUVBgACH4JAhikpJx4fwgEBHgARH1AACBAQD0AfxAoRAAAQX9AAHwEeAR4fAgEBHg4REREOPwYJCQYGCQkGPx8CAQECEhUVFQkBAQ/RCQ8QEAgfBwgQCAcPEAwQDxEKBAoREyQkJB8RGRUTEQACDZBAAAAdwAAAEE2CAACAQIEAg==",
);
const FIRST = 0x20;
const GW = 5;
const GH = 8;

export const GLYPH_H = GH;

// Unscaled px width of a string: 5px/glyph + 1px spacing between glyphs.
export function textWidth(s: string): number {
  return s.length === 0 ? 0 : s.length * (GW + 1) - 1;
}

// Draw text at (x0,y0) with integer scale, calling set(x,y) for each black px.
export function drawText(
  set: (x: number, y: number) => void,
  text: string,
  x0: number,
  y0: number,
  scale: number,
): void {
  let cx = x0;
  for (const ch of text) {
    const gi = ch.charCodeAt(0) - FIRST;
    if (gi >= 0 && gi * 5 + 5 <= FONT.length) {
      const base = gi * 5;
      for (let col = 0; col < GW; col++) {
        const bits = FONT[base + col];
        for (let row = 0; row < GH; row++) {
          if (bits & (1 << row)) {
            for (let dy = 0; dy < scale; dy++)
              for (let dx = 0; dx < scale; dx++) set(cx + col * scale + dx, y0 + row * scale + dy);
          }
        }
      }
    }
    cx += (GW + 1) * scale;
  }
}
