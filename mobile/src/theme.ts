// Design tokens — Flat Design, "industrial slate + stock green" (from the
// UI/UX design-system pass). One source of truth for colour, spacing, radius,
// and type so screens stay consistent. Light only for now; structured so a dark
// map can be added later.

export const colors = {
  primary: "#334155", // slate-700 — primary buttons / banner
  onPrimary: "#FFFFFF",
  accent: "#047857", // emerald-700 — success / commit CTA (AA on white both ways)
  bg: "#F8FAFC", // app background
  surface: "#FFFFFF", // cards / inputs
  fg: "#0F172A", // primary text (contrast ~16:1 on surface)
  mutedFg: "#64748B", // secondary text (slate-500, ~4.6:1 on white)
  muted: "#F1F5F9", // secondary button / chip bg
  border: "#E2E8F0", // slate-200
  destructive: "#B91C1C", // red-700 — no-box / errors (white text ~6:1)
  warning: "#B45309", // amber-700 — inline warnings on white (~4.5:1)
  fieldBg: "#F8FAFC",
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 } as const;

export const HIT = 48; // minimum touch target (Android 48dp)

// Type scale (weights reinforce hierarchy). Colours applied per-use.
export const type = {
  display: { fontSize: 28, fontWeight: "800" as const, letterSpacing: -0.3 },
  h1: { fontSize: 24, fontWeight: "800" as const, letterSpacing: -0.2 },
  h2: { fontSize: 20, fontWeight: "700" as const },
  title: { fontSize: 17, fontWeight: "700" as const },
  body: { fontSize: 16, fontWeight: "400" as const },
  bodyStrong: { fontSize: 16, fontWeight: "600" as const },
  label: {
    fontSize: 12,
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.6,
  },
  caption: { fontSize: 13, fontWeight: "400" as const },
} as const;
