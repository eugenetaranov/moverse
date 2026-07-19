import { printers } from "./niimbot/connection";
import { renderBoxLabel } from "./niimbot/label";
import { loadBoxExtra, loadBoxQr, loadTuning, resolveBoxQrPayload } from "./labelSettings";

// Thrown when no connected printer is assigned box labels — callers turn this
// into the connect / write-by-hand recovery prompt.
export class NoBoxPrinter extends Error {
  constructor() {
    super("no box printer");
    this.name = "NoBoxPrinter";
  }
}

export const MAX_COPIES = 10;

export interface PrintBoxCbs {
  onProgress?: (copy: number, total: number) => void; // "printing <copy> of <total>"
  isCancelled?: () => boolean;
}

// Print a box's label `copies` times on the box-label printer. Single source of
// truth for routing, rendering (at the printer's size/width), QR content, extra
// text, copies, and cancellation — shared by the packing flow and BoxDetail.
export async function printBoxLabels(
  code: string,
  copies: number,
  cbs?: PrintBoxCbs,
): Promise<{ printed: number }> {
  const trimmed = code.trim();
  if (!trimmed) return { printed: 0 };

  const p = printers.printerForKind("box");
  if (!p) throw new NoBoxPrinter();

  const total = Math.max(1, Math.min(MAX_COPIES, Math.floor(copies) || 1));
  const [extra, qr, tuning] = await Promise.all([loadBoxExtra(), loadBoxQr(), loadTuning()]);
  const qrPayload = resolveBoxQrPayload(qr, trimmed);
  const bitmap = renderBoxLabel(trimmed, extra, p.labelSize, p.model.widthPx, qrPayload);

  let printed = 0;
  for (let copy = 1; copy <= total; copy++) {
    if (cbs?.isCancelled?.()) break;
    cbs?.onProgress?.(copy, total);
    await p.client.printImage(bitmap, tuning.density, tuning.labelType);
    printed = copy;
  }
  return { printed };
}
