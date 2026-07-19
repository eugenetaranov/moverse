# app-navigation Specification

## Purpose
TBD - created by archiving change browse-inventory. Update Purpose after archive.
## Requirements
### Requirement: Two-tab app shell

The app SHALL present a persistent bottom tab bar with exactly two top-level tabs — **Pack** and **Browse** — built on React Navigation. Each tab SHALL be a native navigation stack, and every screen SHALL present the same shared native header (compact left-aligned title + leading/trailing slots). The **Pack** tab's stack SHALL host the capture hub (behavior unchanged) and **Settings** as a pushed screen reached from the hub's header action; Settings SHALL NOT be a full-screen overlay. The **Browse** tab SHALL host the inventory browse stack. The currently active tab SHALL be visually indicated, and each tab SHALL show both an icon and a text label.

#### Scenario: Both tabs are reachable

- **WHEN** the app launches
- **THEN** a bottom tab bar shows Pack and Browse, Pack is selected by default, and the capture hub is visible

#### Scenario: Switching tabs preserves each tab's state

- **WHEN** the user fills part of a capture draft on Pack, switches to Browse, then returns to Pack
- **THEN** the in-progress draft (including the locked box) is still present, unchanged

#### Scenario: Active tab is indicated

- **WHEN** the user is on the Browse tab
- **THEN** the Browse tab item is visually highlighted as active and Pack is not

#### Scenario: Settings opens as a pushed screen

- **WHEN** the user taps the settings action in the Pack header
- **THEN** Settings is pushed onto the Pack stack with the standard header and a back arrow, and pressing back returns to the capture hub

#### Scenario: Camera surfaces stay immersive

- **WHEN** Pack shows a full-screen camera surface (capture, scan, write-code, set-box)
- **THEN** the shared header and the bottom tab bar are hidden, and both are restored when returning to the hub

### Requirement: Browse navigation stack

The Browse tab SHALL be a navigation stack whose root is the browse home (boxes/items/search). Tapping a box SHALL push a box-contents screen; tapping an item SHALL push an item-detail screen. Back navigation SHALL return to the previous screen with its prior scroll position and filter/segment state preserved.

#### Scenario: Drill into a box and back

- **WHEN** the user taps a box on the browse home, then presses back
- **THEN** the box-contents screen is shown, and pressing back returns to the browse home with its previous segment and scroll position intact

#### Scenario: Open an item from search and back

- **WHEN** the user searches, opens an item from the results, then presses back
- **THEN** the item detail is shown, and back returns to the search results with the query still applied

### Requirement: Safe-area and touch-target compliance for the shell

The tab bar and screen headers SHALL respect device safe areas (notch, status bar, gesture/home indicator), and every tab bar item SHALL provide a touch target of at least 48dp.

#### Scenario: Content is not obscured by system chrome

- **WHEN** any screen renders
- **THEN** no interactive control is placed under the status bar, notch, or gesture area, and list content is not hidden behind the tab bar

