## MODIFIED Requirements

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
