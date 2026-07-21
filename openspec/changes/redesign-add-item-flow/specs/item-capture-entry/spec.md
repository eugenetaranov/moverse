## ADDED Requirements

### Requirement: Minimal idle capture screen

The Pack screen's idle state SHALL present only three surfaces: a current-box chip showing the active target box, a recent-items list, and one large round centered "New item" button that opens the capture flow. The always-visible photo tile, item-code controls, description field, and dual "Add item / Save" action bar SHALL NOT appear on the idle screen.

#### Scenario: Idle screen shows the entry point

- **WHEN** the Pack screen is shown with no capture in progress and at least one box exists
- **THEN** the screen shows the current-box chip, the recent-items list, and a round "New item" button, and shows none of the per-item capture fields

#### Scenario: New item opens the capture flow

- **WHEN** the user taps the round "New item" button
- **THEN** the full-height capture sheet opens for a new item targeted at the current box

### Requirement: Current-box chip

The idle screen SHALL show the current target box as a chip, persist the current box across app restarts, and open the box picker when the chip is tapped.

#### Scenario: Current box persists across restart

- **WHEN** the user has been packing into a box and relaunches the app
- **THEN** the idle screen's current-box chip shows that same box as the target

#### Scenario: Change box from the chip

- **WHEN** the user taps the current-box chip
- **THEN** the box picker opens, and choosing a box updates the chip's target

### Requirement: Recent items are the reprint surface

The idle screen's recent-items list SHALL show items saved during the current session and SHALL let the user reprint an item's label from that list without minting a new code. In `none` mode (no visible codes) the reprint action SHALL NOT be shown. Editing a saved item continues to live in the Browse item-detail view, not on this list.

#### Scenario: Reprint from recent items

- **WHEN** the user taps the reprint action on a recent item that has a code
- **THEN** that item's existing label is reprinted with no new code minted

#### Scenario: No reprint action in none mode

- **WHEN** the idle recent-items list is shown while in `none` mode
- **THEN** no reprint action is offered on the rows

### Requirement: First-run with no boxes

When no boxes exist yet, the idle screen's primary action SHALL be "Create first box" instead of "New item", and the capture flow SHALL NOT be reachable until a box exists.

#### Scenario: No boxes yet

- **WHEN** the Pack screen is shown and no boxes exist
- **THEN** the primary round button reads "Create first box" and starts box creation rather than opening the item capture flow
