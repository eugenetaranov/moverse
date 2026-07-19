import qrcode from "qrcode-generator";
import type { Bitmap } from "./client";
import { drawText, textWidth, GLYPH_H } from "./font";
import { LabelSize, labelPx, fitsQr } from "../labelSettings";

// Render an item code to a 1bpp label bitmap sized to the label.
//  - Text is the priority: the code fills the label width, large and readable.
//  - Big enough labels (fitsQr) also get a QR *below* the text, sized to fit the
//    width (never overflowing — the old layout scaled the QR to the height and
//    clipped it on tall narrow labels).
//  - Small labels are text-only.
export function renderLabel(code: string, size: LabelSize): Bitmap {
  const { widthPx, heightPx } = labelPx(size);
  const bytesPerRow = Math.ceil(widthPx / 8);
  const data = new Uint8Array(bytesPerRow * heightPx);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= widthPx || y >= heightPx) return;
    data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
  };
  const margin = Math.max(4, Math.round(Math.min(widthPx, heightPx) * 0.06));
  const tw = textWidth(code); // unscaled px

  // Largest integer scale that fits the code across the width.
  const textFillW = Math.max(1, Math.floor((widthPx - margin * 2) / tw));

  if (fitsQr(size)) {
    // Text band on top (cap its height so the QR has room), QR centred below.
    const textScale = Math.max(1, Math.min(textFillW, Math.floor((heightPx * 0.3) / GLYPH_H)));
    const textH = GLYPH_H * textScale;
    drawText(set, code, Math.floor((widthPx - tw * textScale) / 2), margin, textScale);

    const qr = qrcode(0, "M");
    qr.addData(code);
    qr.make();
    const n = qr.getModuleCount();
    const qrTop = margin + textH + margin;
    const availW = widthPx - margin * 2;
    const availH = heightPx - qrTop - margin;
    const scale = Math.max(1, Math.floor(Math.min(availW, availH) / n));
    const qrSize = n * scale;
    const qx = Math.floor((widthPx - qrSize) / 2);
    const qy = qrTop + Math.max(0, Math.floor((availH - qrSize) / 2));
    for (let r = 0; r < n; r++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(r, col)) {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) set(qx + col * scale + dx, qy + r * scale + dy);
        }
  } else {
    // Text only, centred, as large as fits both dimensions.
    const s = Math.max(1, Math.min(textFillW, Math.floor((heightPx - margin * 2) / GLYPH_H)));
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
