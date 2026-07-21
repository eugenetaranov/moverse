## MODIFIED Requirements

### Requirement: Guided item capture workflow

The app SHALL present the capture flow as a single full-height sheet (not a multi-step wizard) opened from the idle "New item" entry point, with the steps in this order: (1) the preselected target box shown as a one-tap-changeable chip, (2) mode-aware item-code handling, (3) photo capture, (4) an optional description, (5) a "Save item" action pinned at the bottom. On successful save the app SHALL confirm success and loop straight back to a fresh item targeted at the same box, with the next label already being prepared. The user SHALL be able to exit the flow to the idle screen via a Done/close control.

#### Scenario: Complete capture end to end

- **WHEN** the user opens the sheet, the box is already selected, a code is handled for the mode, the user takes a photo, optionally edits the description, and taps "Save item"
- **THEN** the item is persisted with its photo, description, and box link, a success confirmation is shown, and the sheet resets to a new item in the same box

#### Scenario: Save failure is recoverable

- **WHEN** the save request fails (e.g. network error)
- **THEN** the app shows an error, keeps the entered photo/description/box/code, and lets the user retry without re-capturing

#### Scenario: Exit the flow

- **WHEN** the user taps Done/close and no unsaved item input exists beyond an auto-printed label
- **THEN** the sheet closes to the idle screen

#### Scenario: Discard confirmation

- **WHEN** the user tries to leave the sheet after entering real input (a photo taken or description typed)
- **THEN** a discard confirmation is shown before the in-progress item is dropped

## ADDED Requirements

### Requirement: Print-on-open item label (assign mode)

In `assign` mode the app SHALL mint the item code and print its label as soon as the capture sheet opens, so the label is available before the item is photographed. The print status SHALL be shown as a non-blocking status line and SHALL NOT block saving.

#### Scenario: Label prints on open

- **WHEN** the capture sheet opens in `assign` mode
- **THEN** the app mints an `ITM-` code and starts printing its label, showing "Printing…" then "Printed" on the status line

#### Scenario: No printer does not block

- **WHEN** the sheet opens in `assign` mode and no printer covers item labels
- **THEN** the status line shows "No printer — will print when connected" with a connect action, the print is deferred, and the user can still complete and save the item

#### Scenario: Print failure offers retry

- **WHEN** the label print fails
- **THEN** the status line shows "Print failed — Retry" and saving remains available

### Requirement: Mode-aware code handling in the sheet

The capture sheet SHALL adapt its code step to the active labeling mode: `assign` mints and prints on open; `scan` replaces the code line with a live scan-sticker step that has a manual-entry fallback and performs no printing; `none` shows no code line and relies on the server minting a hidden code at save.

#### Scenario: Scan mode

- **WHEN** the sheet opens in `scan` mode
- **THEN** a live scan-sticker step is shown with a manual-entry fallback, no label is printed, and the scanned/entered code is used for the item

#### Scenario: None mode

- **WHEN** the sheet opens in `none` mode
- **THEN** no code line is shown, no code is minted on the device, and the server assigns a hidden code at save

### Requirement: Photo-gated save

The "Save item" action SHALL be disabled until at least one photo has been captured for the item, and its disabled state SHALL indicate that a photo is required.

#### Scenario: Save disabled without a photo

- **WHEN** no photo has been captured for the current item
- **THEN** "Save item" is disabled and communicates that a photo is needed

#### Scenario: Save enabled after a photo

- **WHEN** at least one photo has been captured
- **THEN** "Save item" becomes enabled (description remaining optional)
