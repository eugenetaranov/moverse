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

// What a box label's QR encodes: the box code, or a URL template (with an optional
// {code} placeholder substituted at print time). The human-readable box code always
// prints as text regardless.
export type BoxQrMode = "code" | "url";
export interface BoxQrContent {
  mode: BoxQrMode;
  urlTemplate: string;
}
export const DEFAULT_BOX_QR: BoxQrContent = { mode: "code", urlTemplate: "" };
const BOX_QR_KEY = "moverse.boxQrContent";

export async function loadBoxQr(): Promise<BoxQrContent> {
  try {
    const raw = await AsyncStorage.getItem(BOX_QR_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      if (p && (p.mode === "code" || p.mode === "url")) {
        return { mode: p.mode, urlTemplate: typeof p.urlTemplate === "string" ? p.urlTemplate : "" };
      }
    }
  } catch {
    // ignore
  }
  return DEFAULT_BOX_QR;
}

export async function saveBoxQr(c: BoxQrContent): Promise<void> {
  try {
    await AsyncStorage.setItem(BOX_QR_KEY, JSON.stringify(c));
  } catch {
    // best effort
  }
}

// Resolve the QR payload for a box code. URL mode substitutes {code}; without the
// placeholder the URL is encoded as-is. Falls back to the box code.
export function resolveBoxQrPayload(c: BoxQrContent, boxCode: string): string {
  if (c.mode === "url" && c.urlTemplate.trim()) {
    return c.urlTemplate.split("{code}").join(boxCode);
  }
  return boxCode;
}

export const DOTS_PER_MM = 8; // 203 dpi ≈ 8 px/mm
export const HEAD_PX = 384; // widest supported printhead (B1); fallback cap

// Pixel dimensions of the printed bitmap for a label size. The width is capped at
// the printer's printhead width (`maxWidthPx`) — a wide label on a narrow head
// (e.g. a 15mm label on the D110's 12mm/96px head) must clamp to the head, not to
// the global 384px, or the image overflows the head and prints distorted/oversized.
export function labelPx(
  s: LabelSize,
  maxWidthPx: number = HEAD_PX,
): { widthPx: number; heightPx: number } {
  return {
    widthPx: Math.min(Math.round(s.widthMm * DOTS_PER_MM), maxWidthPx),
    heightPx: Math.round(s.heightMm * DOTS_PER_MM),
  };
}
