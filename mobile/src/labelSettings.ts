import AsyncStorage from "@react-native-async-storage/async-storage";

// Label size in mm. Used to size the printed bitmap and to choose QR+text vs
// text-only. Manual for now; auto-detection from the printer can override later.
export interface LabelSize {
  widthMm: number;
  heightMm: number;
}
export const DEFAULT_LABEL: LabelSize = { widthMm: 40, heightMm: 30 };

const KEY = "moverse.labelSize";

export async function loadLabelSize(): Promise<LabelSize> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.widthMm === "number" && typeof p?.heightMm === "number") return p;
    }
  } catch {
    // ignore — fall back to default
  }
  return DEFAULT_LABEL;
}

export async function saveLabelSize(s: LabelSize): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // best effort
  }
}

// A QR + text layout needs a reasonably square, ~>=20mm label; otherwise the
// label is printed text-only.
export function fitsQr(s: LabelSize): boolean {
  return Math.min(s.widthMm, s.heightMm) >= 20;
}

// Printer tuning the user can adjust for their hardware/stock.
export interface PrintTuning {
  density: number; // 1–5
  labelType: number; // 1 gaps, 2 black-mark, 3 continuous
}
export const DEFAULT_TUNING: PrintTuning = { density: 3, labelType: 1 };
export const LABEL_TYPES: { v: number; label: string }[] = [
  { v: 1, label: "Gaps" },
  { v: 3, label: "Continuous" },
  { v: 2, label: "Black-mark" },
];
const TUNING_KEY = "moverse.printTuning";

export async function loadTuning(): Promise<PrintTuning> {
  try {
    const raw = await AsyncStorage.getItem(TUNING_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (typeof p?.density === "number" && typeof p?.labelType === "number") return p;
    }
  } catch {
    // ignore
  }
  return DEFAULT_TUNING;
}
export async function saveTuning(t: PrintTuning): Promise<void> {
  try {
    await AsyncStorage.setItem(TUNING_KEY, JSON.stringify(t));
  } catch {
    // best effort
  }
}

// Free-form text printed on every box label (phone / WhatsApp / address).
const BOX_EXTRA_KEY = "moverse.boxExtra";
export async function loadBoxExtra(): Promise<string> {
  try {
    return (await AsyncStorage.getItem(BOX_EXTRA_KEY)) ?? "";
  } catch {
    return "";
  }
}
export async function saveBoxExtra(t: string): Promise<void> {
  try {
    await AsyncStorage.setItem(BOX_EXTRA_KEY, t);
  } catch {
    // best effort
  }
}

export const DOTS_PER_MM = 8; // B1 is 203 dpi ≈ 8 px/mm
export const HEAD_PX = 384; // B1 printhead width cap

// Pixel dimensions of the printed bitmap for a label size.
export function labelPx(s: LabelSize): { widthPx: number; heightPx: number } {
  return {
    widthPx: Math.min(Math.round(s.widthMm * DOTS_PER_MM), HEAD_PX),
    heightPx: Math.round(s.heightMm * DOTS_PER_MM),
  };
}
