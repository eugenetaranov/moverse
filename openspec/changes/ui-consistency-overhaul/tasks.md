## 1. Shared UI foundation (src/ui.tsx + theme)

- [x] 1.1 Add spacing/layout constants (e.g. `SCREEN = { padH: space.lg, padBottom: space.xxl }`, section gap) and a `Screen` container that applies background, horizontal padding, and a bottom safe-area inset
- [x] 1.2 Add a unified `Button({ title, onPress, icon, tone, variant, disabled })` (tones `primary` | `accent` | `danger`, one height/typography); keep `PrimaryButton`/`SecondaryButton` as thin wrappers to limit call-site churn
- [x] 1.3 Add a shared `TextField` (bordered input: `colors.border`, `radius.md`, `minHeight: HIT`, 16px, optional `multiline`)
- [x] 1.4 Add `SectionHeader` (uppercase `t.label`) and confirm `FieldLabel`; add `SelectableCard` (icon + title + subtitle + trailing state) and `RowCard` (or make `SelectableCard` cover the browse box row)
- [x] 1.5 Export one shared `stackScreenOptions` (headerStyle `colors.surface`, tint `colors.fg`, title 20/left-aligned, minimal shadow) for use by both stacks

## 2. Navigation restructure (App.tsx)

- [x] 2.1 Add a `PackStack` (native stack) with screens `Pack` and `Settings`, using `stackScreenOptions`; keep the tab navigator `headerShown: false`
- [x] 2.2 Apply `stackScreenOptions` to the existing Browse stack so both stacks share one header style
- [x] 2.3 Wire the Pack tab to `PackStack`; set the Pack screen's header title ("Moverse") and a header-right settings action

## 3. Pack screen (src/screens/Pack.tsx)

- [x] 3.1 Remove the in-body header row and `paddingTop: 44`; move the "Moverse" title to the stack header and the gear to `headerRight` → `navigation.navigate("Settings")`
- [x] 3.2 Remove the `screen === "settings"` branch (Settings is now a pushed screen)
- [x] 3.3 Extend the immersive effect to also hide the stack header (`headerShown: false`) while a camera surface is up, restoring it on return to the hub
- [x] 3.4 Replace bespoke inputs/labels/cards with the shared `TextField`/`FieldLabel`/`SelectableCard`; body uses the `Screen` container / shared padding

## 4. Settings screen (src/Settings.tsx)

- [x] 4.1 Convert to a normal pushed screen: delete the overlay header row, the "Done" button, and `paddingTop: 56`; rely on the stack header + back arrow (drop the `onClose` prop)
- [x] 4.2 Replace the local `Btn` with the shared `Button` (danger tone for Cancel), the inline segmented control with shared `Segmented`, inputs with `TextField`, mode cards with `SelectableCard`, and section titles with `SectionHeader`
- [x] 4.3 Keep the Log console block as an intentional dark exception; apply shared spacing to everything else

## 5. Browse screens (BrowseHome / BoxDetail / ItemDetail / cards / Onboarding)

- [x] 5.1 Migrate BoxDetail and ItemDetail inputs/labels/buttons/section titles to the shared primitives; standardize padding via the `Screen`/shared constants
- [x] 5.2 Point `cards.tsx` `BoxCard` at the shared card; migrate Pack's Onboarding cards to `SelectableCard`
- [x] 5.3 Confirm all three Browse screens use the shared header via `stackScreenOptions` (no per-screen header overrides beyond the title)

## 6. Verification

- [x] 6.1 `npx tsc --noEmit` clean after each screen migration
- [x] 6.2 `npx expo export` bundles successfully
- [ ] 6.3 On device/Expo Go: Pack, Settings, and all Browse screens show identical header/title placement, height, and horizontal padding
- [ ] 6.4 Regression check: capture→save, printing, browse, search, and item/box edits all still work; camera surfaces show no header/tab bar and restore correctly
