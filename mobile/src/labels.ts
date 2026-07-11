import { ITEM_PREFIX, BOX_PREFIX } from "./config";

export type LabelKind = "item" | "box" | "unknown";

export function classify(code: string): LabelKind {
  const v = code.trim();
  if (v.startsWith(ITEM_PREFIX)) return "item";
  if (v.startsWith(BOX_PREFIX)) return "box";
  return "unknown";
}

export function isItemCode(code: string): boolean {
  return classify(code) === "item";
}

export function isBoxCode(code: string): boolean {
  return classify(code) === "box";
}
