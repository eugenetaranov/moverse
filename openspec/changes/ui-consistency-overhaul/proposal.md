## Why

The app grew screen by screen and now looks like three different apps. The **title/header** is the worst offender: Pack draws a custom in-body row with a 20px title and a gear icon at a hardcoded `paddingTop: 44`; Settings draws its own overlay row with a 28px title, a text "Done" button, and `paddingTop: 56`; the Browse screens use React Navigation's native header with a back arrow. Buttons, inputs, segmented controls, cards, and section labels have each been re-implemented per screen and drifted (e.g. Settings' `Btn` is 48px/15px, `ui.PrimaryButton` is 56px/17px). The result is inconsistent title placement, spacing, and controls from page to page.

## What Changes

- **BREAKING (app shell)**: the **Pack tab becomes a stack** so Pack and **Settings are real navigation screens**. Settings stops being a full-screen overlay swapped by Pack's internal state; it is pushed with a standard back arrow. Every top-level screen (Pack, Settings, Browse Home/Box/Item) then renders **one styled React Navigation header** — compact ~20px left-aligned title, consistent height, safe-area top, back/action affordances in fixed slots — configured once in shared `screenOptions`.
- Remove the two bespoke headers (Pack's in-body header, Settings' overlay header) and the hardcoded `paddingTop: 44/56`; top spacing comes from the header + safe-area insets.
- Introduce **shared layout + spacing conventions**: a `Screen` body container with one horizontal padding (`space.lg`) and a bottom safe-area inset, plus a standard section rhythm. Screens use these instead of per-screen padding values.
- Consolidate the **duplicated primitives into one set** in `src/ui.tsx` and require screens to use them: `Button` (with `primary` / `accent` / `danger` tones and one size), `TextField` (the repeated input style), `Segmented` (drop Settings' inline segmented control), `SelectableCard` / `RowCard` (unify Settings' `modeCard`, Pack's onboarding `onCard`, and the browse `BoxCard` row), `SectionHeader`, and `FieldLabel`.
- No behavior/feature changes: capture, printing, browsing, search, and edits work exactly as before — this is presentation and structure only.

## Capabilities

### New Capabilities
- `ui-consistency`: A shared UI system — one screen scaffold + header/title convention, one spacing/safe-area standard, and a single set of reusable primitives (button, text field, segmented, cards, section header, field label) that all screens must use instead of bespoke copies.

### Modified Capabilities
- `app-navigation`: The Pack tab becomes a stack that also hosts Settings as a pushed screen; all screens present the same native header (title + back), replacing Pack's and Settings' custom headers.

## Impact

- **Mobile app only.** No backend, data-model, or dependency changes (React Navigation, safe-area-context already present).
- `App.tsx`: add a `PackStack` (Pack → Settings); enable a shared, styled header via `screenOptions`; keep the tab navigator headerless.
- `src/screens/Pack.tsx`: remove the in-body header + `paddingTop: 44`; the gear icon becomes a header-right action that navigates to Settings; hide the header during full-screen camera surfaces (as the tab bar is already hidden).
- `src/Settings.tsx`: drop the overlay header/"Done"/`paddingTop: 56`; becomes a normal screen; adopt shared primitives (its `Btn`, inline segmented, inputs, mode cards, section labels are replaced).
- `src/ui.tsx` (+ `src/screens/cards.tsx`): grow into the single source of shared primitives; browse screens, BoxDetail, ItemDetail, and Onboarding switch to them.
- Risk is visual regression during refactor; mitigated by unchanged logic and a screen-by-screen typecheck/bundle pass.
