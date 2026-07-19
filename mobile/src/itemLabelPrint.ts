import { printers } from "./niimbot/connection";
import { renderLabel } from "./niimbot/label";
import { loadTuning } from "./labelSettings";
import { MAX_COPIES } from "./boxLabelPrint";

// Thrown when no connected printer is assigned item labels.
export class NoItemPrinter extends Error {
  constructor() {
    super("no item printer");
    this.name = "NoItemPrinter";
  }
}

export interface PrintItemCbs {
  onProgress?: (copy: number, total: number) => void;
  isCancelled?: () => boolean;
}

// Print an item's label `copies` times on the item-label printer. Shared by the
// packing flow and ItemDetail so routing/rendering/copies stay identical.
export async function printItemLabels(
  code: string,
  copies: number,
  cbs?: PrintItemCbs,
): Promise<{ printed: number }> {
  const trimmed = code.trim();
  if (!trimmed) return { printed: 0 };

  const p = printers.printerForKind("item");
  if (!p) throw new NoItemPrinter();

  const total = Math.max(1, Math.min(MAX_COPIES, Math.floor(copies) || 1));
  const tuning = await loadTuning();
  const bitmap = renderLabel(trimmed, p.labelSize, p.model.widthPx);

  let printed = 0;
  for (let copy = 1; copy <= total; copy++) {
    if (cbs?.isCancelled?.()) break;
    cbs?.onProgress?.(copy, total);
    await p.client.printImage(bitmap, tuning.density, tuning.labelType);
    printed = copy;
  }
  return { printed };
}
