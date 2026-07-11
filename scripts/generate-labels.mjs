/**
 * Generate a printable HTML sheet of sequential QR labels.
 *
 * Usage:
 *   npm install            # installs the `qrcode` dep in this folder
 *   node generate-labels.mjs ITM 1 200   # 200 item labels: ITM-0001..ITM-0200
 *   node generate-labels.mjs BOX 1 40    # 40 box labels:   BOX-0001..BOX-0040
 *
 * Open the resulting labels-<PREFIX>.html in a browser and print, or import
 * the codes into the NIIMBOT app. (NIIMBOT's own app also has a built-in
 * serial-number feature that can print these ranges without this script.)
 */
import QRCode from "qrcode";
import { writeFileSync } from "node:fs";

const [, , prefixArg = "ITM", startArg = "1", countArg = "50"] = process.argv;
const prefix = prefixArg.toUpperCase();
const start = parseInt(startArg, 10);
const count = parseInt(countArg, 10);

const cells = [];
for (let i = 0; i < count; i++) {
  const n = String(start + i).padStart(4, "0");
  const code = `${prefix}-${n}`;
  const dataUrl = await QRCode.toDataURL(code, { margin: 1, width: 160 });
  cells.push(
    `<div class="cell"><img src="${dataUrl}" /><div class="cap">${code}</div></div>`,
  );
}

const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>${prefix} labels</title>
<style>
  @page { margin: 8mm; }
  body { font-family: sans-serif; }
  .grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8mm; }
  .cell { text-align: center; break-inside: avoid; }
  .cell img { width: 120px; height: 120px; }
  .cap { font-size: 12px; margin-top: 2px; }
</style></head>
<body><div class="grid">${cells.join("\n")}</div></body></html>`;

const out = `labels-${prefix}.html`;
writeFileSync(out, html);
console.log(`Wrote ${count} labels to ${out} (${prefix}-${String(start).padStart(4, "0")} …)`);
