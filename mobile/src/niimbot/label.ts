import qrcode from "qrcode-generator";
import type { Bitmap } from "./client";
import { drawText, textWidth, GLYPH_H } from "./font";
import { LabelSize, labelPx, fitsQr } from "../labelSettings";

// Render an item code to a 1bpp label bitmap sized to the label. Large labels
// get QR + text; small labels get text only (chosen by fitsQr).
export function renderLabel(code: string, size: LabelSize): Bitmap {
  const { widthPx, heightPx } = labelPx(size);
  const bytesPerRow = Math.ceil(widthPx / 8);
  const data = new Uint8Array(bytesPerRow * heightPx);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= widthPx || y >= heightPx) return;
    data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
  };
  const margin = 3;

  if (fitsQr(size)) {
    // QR on the left, code text on the right.
    const qr = qrcode(0, "M");
    qr.addData(code);
    qr.make();
    const n = qr.getModuleCount();
    const avail = heightPx - margin * 2;
    const scale = Math.max(1, Math.floor(avail / n));
    const qrSize = n * scale;
    const qx = margin;
    const qy = Math.floor((heightPx - qrSize) / 2);
    for (let r = 0; r < n; r++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(r, col)) {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) set(qx + col * scale + dx, qy + r * scale + dy);
        }

    const textX = qx + qrSize + 6;
    const tw = textWidth(code);
    const sX = Math.max(1, Math.floor((widthPx - textX - margin) / tw));
    const sY = Math.max(1, Math.floor(avail / GLYPH_H));
    const s = Math.max(1, Math.min(sX, sY, 4));
    drawText(set, code, textX, Math.floor((heightPx - GLYPH_H * s) / 2), s);
  } else {
    // Text only, centred and scaled to fill.
    const tw = textWidth(code);
    const sX = Math.max(1, Math.floor((widthPx - margin * 2) / tw));
    const sY = Math.max(1, Math.floor((heightPx - margin * 2) / GLYPH_H));
    const s = Math.min(sX, sY);
    drawText(
      set,
      code,
      Math.floor((widthPx - tw * s) / 2),
      Math.floor((heightPx - GLYPH_H * s) / 2),
      s,
    );
  }

  return { width: widthPx, height: heightPx, data };
}
