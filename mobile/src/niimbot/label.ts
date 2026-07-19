import qrcode from "qrcode-generator";
import type { Bitmap } from "./client";
import { drawText, textWidth, GLYPH_H } from "./font";
import { LabelSize, labelPx, fitsQr } from "../labelSettings";

// Render an item code to a 1bpp label bitmap sized to the label.
//  - The code runs along the label's LONGER side so the font is as large as
//    possible: we lay everything out on a "logical" canvas whose long axis is
//    horizontal, then rotate 90° into the physical bitmap when the label is
//    taller than it is wide (narrow tape like the D110).
//  - Text is the priority and fills the long axis, large and readable.
//  - Big enough labels (fitsQr) also get a QR below the code; small labels are
//    text-only.
export function renderLabel(code: string, size: LabelSize, maxWidthPx?: number): Bitmap {
  const { widthPx, heightPx } = labelPx(size, maxWidthPx);
  const bytesPerRow = Math.ceil(widthPx / 8);
  const data = new Uint8Array(bytesPerRow * heightPx);
  const setPhys = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= widthPx || y >= heightPx) return;
    data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
  };

  // Logical canvas: long axis horizontal. Rotate 90° CW into the physical bitmap
  // when the label is portrait (taller than wide) so the code reads along the length.
  const portrait = heightPx > widthPx;
  const LW = portrait ? heightPx : widthPx; // logical width (the long side)
  const LH = portrait ? widthPx : heightPx; // logical height (the short side)
  const set = portrait ? (x: number, y: number) => setPhys(widthPx - 1 - y, x) : setPhys;

  const margin = Math.max(4, Math.round(Math.min(LW, LH) * 0.06));
  const tw = textWidth(code); // unscaled px
  // Largest integer scale that fits the code across the long axis.
  const textFillW = Math.max(1, Math.floor((LW - margin * 2) / tw));

  if (fitsQr(size)) {
    // Big code band on top, QR centred below — both within the short axis (LH).
    const textScale = Math.max(1, Math.min(textFillW, Math.floor((LH * 0.42) / GLYPH_H)));
    const textH = GLYPH_H * textScale;
    drawText(set, code, Math.floor((LW - tw * textScale) / 2), margin, textScale);

    const qr = qrcode(0, "M");
    qr.addData(code);
    qr.make();
    const n = qr.getModuleCount();
    const qrTop = margin + textH + margin;
    const availW = LW - margin * 2;
    const availH = LH - qrTop - margin;
    const scale = Math.max(1, Math.floor(Math.min(availW, availH) / n));
    const qrSize = n * scale;
    const qx = Math.floor((LW - qrSize) / 2);
    const qy = qrTop + Math.max(0, Math.floor((availH - qrSize) / 2));
    for (let r = 0; r < n; r++)
      for (let col = 0; col < n; col++)
        if (qr.isDark(r, col)) {
          for (let dy = 0; dy < scale; dy++)
            for (let dx = 0; dx < scale; dx++) set(qx + col * scale + dx, qy + r * scale + dy);
        }
  } else {
    // Text only, centred, as large as fits along the long axis and short axis.
    const s = Math.max(1, Math.min(textFillW, Math.floor((LH - margin * 2) / GLYPH_H)));
    drawText(
      set,
      code,
      Math.floor((LW - tw * s) / 2),
      Math.floor((LH - GLYPH_H * s) / 2),
      s,
    );
  }

  return { width: widthPx, height: heightPx, data };
}

// Word-wrap text into lines that fit `maxChars` characters, honoring existing
// newlines and hard-splitting over-long words.
function wrapLines(text: string, maxChars: number): string[] {
  const out: string[] = [];
  for (const raw of text.split("\n")) {
    let line = "";
    for (const word of raw.split(/\s+/).filter(Boolean)) {
      let w = word;
      while (w.length > maxChars) {
        if (line) {
          out.push(line);
          line = "";
        }
        out.push(w.slice(0, maxChars));
        w = w.slice(maxChars);
      }
      const next = line ? `${line} ${w}` : w;
      if (next.length <= maxChars) line = next;
      else {
        if (line) out.push(line);
        line = w;
      }
    }
    out.push(line);
  }
  return out;
}

// Box label: box code prominent, an optional QR (fitsQr), and free-form extra
// text (phone / address / links) in small wrapped lines at the bottom.
export function renderBoxLabel(
  boxCode: string,
  extraText: string,
  size: LabelSize,
  maxWidthPx?: number,
  qrPayload?: string,
): Bitmap {
  const { widthPx, heightPx } = labelPx(size, maxWidthPx);
  const bytesPerRow = Math.ceil(widthPx / 8);
  const data = new Uint8Array(bytesPerRow * heightPx);
  const set = (x: number, y: number) => {
    if (x < 0 || y < 0 || x >= widthPx || y >= heightPx) return;
    data[y * bytesPerRow + (x >> 3)] |= 0x80 >> (x & 7);
  };
  const margin = Math.max(4, Math.round(Math.min(widthPx, heightPx) * 0.06));
  const availW = widthPx - margin * 2;

  // Box code at top (fills the width, capped in height).
  const codeW = textWidth(boxCode);
  const codeScale = Math.max(
    1,
    Math.min(Math.floor(availW / codeW), Math.floor((heightPx * 0.22) / GLYPH_H)),
  );
  const codeH = GLYPH_H * codeScale;
  drawText(set, boxCode, Math.floor((widthPx - codeW * codeScale) / 2), margin, codeScale);

  // Extra text wrapped at a small scale.
  const extraScale = 2;
  const lineH = GLYPH_H * extraScale + 2;
  const extra = (extraText || "").trim();
  const maxChars = Math.max(1, Math.floor((availW / extraScale + 1) / 6));
  const lines = extra ? wrapLines(extra, maxChars) : [];
  const extraH = lines.length ? lines.length * lineH : 0;

  // QR (if the label is big enough) fills the band between code and extra text.
  if (fitsQr(size)) {
    const midTop = margin + codeH + margin;
    const midBottom = heightPx - margin - (extraH ? extraH + margin : 0);
    const midH = midBottom - midTop;
    if (midH > 24) {
      const qr = qrcode(0, "M");
      qr.addData(qrPayload ?? boxCode);
      qr.make();
      const n = qr.getModuleCount();
      const scale = Math.max(1, Math.floor(Math.min(availW, midH) / n));
      const qrSize = n * scale;
      const qx = Math.floor((widthPx - qrSize) / 2);
      const qy = midTop + Math.max(0, Math.floor((midH - qrSize) / 2));
      for (let r = 0; r < n; r++)
        for (let col = 0; col < n; col++)
          if (qr.isDark(r, col)) {
            for (let dy = 0; dy < scale; dy++)
              for (let dx = 0; dx < scale; dx++) set(qx + col * scale + dx, qy + r * scale + dy);
          }
    }
  }

  // Extra text lines at the bottom (or right under the code on text-only labels).
  let ey = fitsQr(size) ? heightPx - margin - extraH : margin + codeH + margin;
  for (const line of lines) {
    const lw = textWidth(line) * extraScale;
    drawText(set, line, Math.floor((widthPx - lw) / 2), ey, extraScale);
    ey += lineH;
  }

  return { width: widthPx, height: heightPx, data };
}
