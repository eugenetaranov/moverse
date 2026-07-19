## Context

`theme.ts` already defines tokens (colors, `space`, `radius`, `type`, `HIT`), but screens don't apply them uniformly. Three header systems coexist (Pack in-body, Settings overlay, Browse native-stack), and primitives are duplicated: `ui.PrimaryButton`/`SecondaryButton` vs Settings' `Btn`; `ui.Segmented` vs Settings' inline `seg`; the input block copied into Settings/BoxDetail/ItemDetail/Pack; three card variants (`modeCard`, onboarding `onCard`, `BoxCard`). Settings is not a navigation screen — Pack renders it via `if (screen === "settings") return <Settings/>` — which is why it can't share the nav header.

Decisions from the user: **native React Navigation headers on every screen**, and a **compact ~20px left-aligned title**.

## Goals / Non-Goals

**Goals:**
- One header/title treatment on every screen (same typography, height, alignment, safe-area top, back/action slots).
- One spacing standard (horizontal `space.lg`, bottom safe-area inset, section rhythm); no hardcoded status-bar paddings.
- One implementation of each primitive (button, text field, segmented, card, section header, field label), used everywhere.
- Zero behavior change: capture, print, browse, search, edit all work identically.

**Non-Goals:**
- No visual redesign / rebrand — reuse the existing tokens and palette; this is consistency, not a new look.
- No new features, screens, or endpoints.
- Not converting the Pack camera surfaces (capture/scan/writeCode/setBox) into nav screens — they stay full-screen and header-less (immersive).
- No dark mode work (theme is light-only today; out of scope).

## Decisions

**Every screen sits under a native stack header, styled once.** The tab navigator stays `headerShown: false`; each tab is a native-stack whose `screenOptions` set the shared header: `headerStyle` = `colors.surface`, `headerTintColor` = `colors.fg`, `headerTitleStyle` = `{ fontSize: 20, fontWeight: "700" }`, `headerTitleAlign: "left"`, subtle/none shadow. Browse is already a stack; the change adds a **`PackStack`** (`Pack` → `Settings`). Shared options live in one exported `stackScreenOptions` object so both stacks are identical. Alternative (custom `ScreenHeader` on `headerShown:false`) was considered and rejected per the user's choice — more code and manual back handling for no visual gain here.

**Settings becomes a pushed screen in `PackStack`.** Pack's header-right gear does `navigation.navigate("Settings")`; Settings gets the standard header with an automatic back arrow, replacing its overlay row, "Done" button, and `paddingTop: 56`. Pack's own `screen === "settings"` branch is removed. This is the structural fix for the title-location complaint.

**Pack loses its in-body header and magic top padding.** The "Moverse" title becomes the stack header title; the gear moves to `headerRight`. `paddingTop: 44` is deleted (the header + safe-area own the top). During full-screen camera surfaces Pack calls `navigation.setOptions({ headerShown: false })` (mirroring the existing tab-bar-hide effect) so capture/scan stay immersive.

**One `Screen` body container.** A small wrapper applies the standard background, horizontal padding (`space.lg`), and a bottom inset from `useSafeAreaInsets()` (for scroll content above the tab bar). Screens compose `Screen` (or pass its `contentContainerStyle` to their `FlatList`/`ScrollView`) instead of ad-hoc padding. List screens keep `FlatList` but take padding from shared style constants.

**One primitive set in `src/ui.tsx`.** Consolidate:
- `Button({ title, onPress, icon, tone, disabled })` with `tone: "primary" | "accent" | "danger"` and a single height/typography. Settings' `Btn` and the current `Primary/SecondaryButton` collapse into it (a `variant: "solid" | "muted"` covers the old secondary look). Keep thin `PrimaryButton`/`SecondaryButton` wrappers if convenient to limit churn.
- `TextField` — the repeated bordered input (border `colors.border`, `radius.md`, `minHeight: HIT`, 16px), with an optional `multiline`.
- `Segmented` — already shared; Settings' density/label-type controls switch to it.
- `SelectableCard` (icon + title + subtitle + trailing state) for Settings mode cards and Pack onboarding cards; `RowCard` (or reuse `SelectableCard`) for the browse `BoxCard`.
- `SectionHeader` (uppercase `t.label`) and `FieldLabel` (already present) for all section/field titles.

**Spacing constants.** Export `SCREEN = { padH: space.lg, padBottom: space.xxl }` and a `sectionGap` so every screen references the same numbers rather than literals.

## Risks / Trade-offs

- **Refactor visual regression** → Logic is untouched; migrate one screen at a time and run `tsc --noEmit` + `expo export` after each. Compare each screen before/after on device.
- **Pack camera immersion** → Must hide the header (and already hides the tab bar) when `screen !== "home"`; verify capture/scan/writeCode/setBox show no header and restore it on return.
- **Settings back vs. unsaved state** → Settings persists on change (autosave already), so a back arrow loses nothing; no confirm needed.
- **Button API churn** → Many call sites; keeping `PrimaryButton`/`SecondaryButton` as wrappers over the unified `Button` limits edits and risk.
- **Android-only header cosmetics** → Native header renders per-platform; acceptable (Android is the target) and it's still one styled config.

## Migration Plan

1. Add `stackScreenOptions` + `PackStack` (Pack → Settings) in `App.tsx`; tabs stay headerless. Verify navigation + back.
2. Convert Settings to a pushed screen; delete its overlay header/`paddingTop`. Remove Pack's `settings` branch; move the gear to `headerRight`.
3. Strip Pack's in-body header + `paddingTop: 44`; wire header title/actions; add the header-hide effect for camera surfaces.
4. Grow `src/ui.tsx` primitives (`Button` tones, `TextField`, `SelectableCard`/`RowCard`, `SectionHeader`); migrate Settings, then Pack/Onboarding, then Browse/Box/Item to them.
5. Introduce the `Screen` container + spacing constants; replace per-screen padding.
Each step is additive/mechanical; rollback is per-commit.

## Open Questions

- Should the Pack tab's header title read **"Moverse"** (brand) or **"Pack"** (matches the tab label)? Default: "Moverse".
- Keep the Log's dark console block in Settings as-is (it's intentionally terminal-styled), or bring it into the neutral surface style? Default: keep it dark (functional exception).
