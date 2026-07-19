// Minimal Niimbot model registry. Pulled in as a prerequisite for multi-printer
// support (task 0.1): a printer needs to know its printhead width so item vs box
// labels raster correctly, and we want a human-readable model label in the UI.
//
// Support is claimed only for physically-tested models (`verified: true`).
// Unknown Niimbot devices fall back to a safe default (B1 params). The print
// protocol itself (client.ts) is width-agnostic for widths <= 384px, so the
// per-model data here is width + labelling metadata, not a separate print flow.

import type { LabelSize } from "../labelSettings";

export interface NiimbotModel {
  id: string; // stable key, e.g. "b1"
  label: string; // human label, e.g. "Niimbot B1"
  matchNames: string[]; // anchored name tokens used to recognize the device
  widthPx: number; // printhead width in px (203dpi ≈ 8px/mm)
  defaultLabel: LabelSize; // sensible default stock size for this model (mm)
  verified: boolean; // physically tested on this project
}

// Ordered most-specific first so detectModel matches "b18"/"b21"/"d110" before "b1"/"d11".
// defaultLabel picks the common stock for each family so a fresh printer prints at
// the right size before the user tweaks it — the D-series small tape (≈12mm) must
// not inherit the B1's 45–80mm or the image spills across several die-cut labels.
export const NIIMBOT_MODELS: NiimbotModel[] = [
  { id: "b18", label: "Niimbot B18", matchNames: ["b18"], widthPx: 240, defaultLabel: { widthMm: 15, heightMm: 40 }, verified: false },
  { id: "b21", label: "Niimbot B21", matchNames: ["b21"], widthPx: 384, defaultLabel: { widthMm: 40, heightMm: 30 }, verified: false },
  { id: "b1", label: "Niimbot B1", matchNames: ["b1"], widthPx: 384, defaultLabel: { widthMm: 45, heightMm: 80 }, verified: true },
  { id: "d110", label: "Niimbot D110", matchNames: ["d110"], widthPx: 96, defaultLabel: { widthMm: 12, heightMm: 40 }, verified: false },
  { id: "d11", label: "Niimbot D11", matchNames: ["d11"], widthPx: 96, defaultLabel: { widthMm: 12, heightMm: 40 }, verified: false },
];

// Conservative fallback for an unrecognized Niimbot device: B1 params (the
// widest verified head), so we never overflow a narrow head by assuming too wide.
export const DEFAULT_MODEL: NiimbotModel = NIIMBOT_MODELS.find((m) => m.id === "b1")!;

// Anchored (word-boundary) match so "b1" doesn't false-match "Room-B1"/"B18".
function nameMatches(haystack: string, token: string): boolean {
  const re = new RegExp(`(^|[^a-z0-9])${token}([^a-z0-9]|$)`, "i");
  return re.test(haystack) || haystack.toLowerCase() === token;
}

// Detect a model from the advertised device name. Returns the default model when
// nothing matches so callers always have usable width params.
export function detectModel(name: string | null | undefined): NiimbotModel {
  const n = (name ?? "").toLowerCase();
  for (const m of NIIMBOT_MODELS) {
    if (m.matchNames.some((tok) => nameMatches(n, tok))) return m;
  }
  return DEFAULT_MODEL;
}

export function modelById(id: string | null | undefined): NiimbotModel {
  return NIIMBOT_MODELS.find((m) => m.id === id) ?? DEFAULT_MODEL;
}
