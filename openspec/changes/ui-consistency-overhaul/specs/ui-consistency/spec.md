## ADDED Requirements

### Requirement: Consistent screen header

Every in-app screen (Pack, Settings, and the Browse screens) SHALL present the same header treatment: a single compact, left-aligned title (~20px) at a consistent height, with safe-area top spacing, a leading back/close affordance when the screen is pushed, and screen actions in a trailing slot. Screens SHALL NOT draw bespoke in-body title rows, and title position SHALL NOT depend on hardcoded status-bar padding.

#### Scenario: Titles match across pages

- **WHEN** the user views the Pack, Settings, and a Browse screen
- **THEN** each shows its title in the same size, weight, alignment, and header height

#### Scenario: No hardcoded top padding

- **WHEN** any screen renders its title
- **THEN** the title sits in the shared header (derived from the header + safe-area inset), not offset by a per-screen fixed top padding

#### Scenario: Actions live in the header slots

- **WHEN** a screen has a primary navigation action (e.g. Pack's settings entry, a pushed screen's back)
- **THEN** it appears in the header's leading or trailing slot, not as an ad-hoc in-body control

### Requirement: Consistent content spacing

All screens SHALL use one horizontal content padding and a bottom inset that keeps scrollable content clear of the tab bar and gesture area, plus a consistent vertical rhythm between sections. Screens SHALL reference shared spacing constants rather than per-screen literal padding values.

#### Scenario: Identical horizontal insets

- **WHEN** the user compares content edges on two different screens
- **THEN** the left and right content insets are identical

#### Scenario: Content clears system chrome

- **WHEN** a screen's content scrolls to the end
- **THEN** the last item is fully visible above the bottom tab bar / gesture area

### Requirement: Single set of shared UI primitives

The app SHALL provide exactly one implementation of each shared control — button, text field, segmented control, card, section header, and field label — in a shared UI module, and every screen SHALL use these instead of re-implementing an equivalent. Buttons SHALL share one size and typography and support `primary`, `accent`, and `danger` tones.

#### Scenario: Buttons are unified

- **WHEN** an action button renders on Settings and on Pack
- **THEN** both come from the shared button component with the same height and typography, differing only by tone

#### Scenario: Inputs are unified

- **WHEN** a text input renders on Settings and on an item/box detail screen
- **THEN** both come from the shared text-field component with the same border, radius, height, and font size

#### Scenario: Segmented controls are unified

- **WHEN** a segmented control renders in Settings and in the browse screens
- **THEN** both come from the shared segmented component (no bespoke per-screen segmented control remains)

#### Scenario: Cards are unified

- **WHEN** selectable/list cards render (Settings mode cards, Pack onboarding cards, browse box rows)
- **THEN** they come from the shared card component(s), with consistent padding, radius, and border
