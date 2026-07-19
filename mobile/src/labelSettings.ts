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

export const DOTS_PER_MM = 8; // B1 is 203 dpi ≈ 8 px/mm
export const HEAD_PX = 384; // B1 printhead width cap

// Pixel dimensions of the printed bitmap for a label size.
export function labelPx(s: LabelSize): { widthPx: number; heightPx: number } {
  return {
    widthPx: Math.min(Math.round(s.widthMm * DOTS_PER_MM), HEAD_PX),
    heightPx: Math.round(s.heightMm * DOTS_PER_MM),
  };
}
