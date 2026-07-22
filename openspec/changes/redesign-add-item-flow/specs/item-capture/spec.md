## MODIFIED Requirements

### Requirement: Guided item capture workflow

The app SHALL present the capture flow as a single full-height sheet (not a multi-step wizard) opened from the idle "New item" entry point, with the steps in this order: (1) the preselected target box shown as a one-tap-changeable chip, (2) mode-aware item-code handling, (3) photo capture, (4) an optional description, (5) a "Save item" action pinned at the bottom. On successful save the app SHALL confirm success and return to the idle screen, keeping the same box as the current target; it SHALL NOT mint or print the next item's label as part of saving. The user SHALL be able to exit the flow to the idle screen via a Done/close control.

#### Scenario: Complete capture end to end

- **WHEN** the user opens the sheet, the box is already selected, a code is handled for the mode, the user takes a photo, optionally edits the description, and taps "Save item"
- **THEN** the item is persisted with its photo, description, and box link, a success confirmation is shown, and the app returns to the idle screen with the same box still selected

#### Scenario: Saving does not print the next label

- **WHEN** an assign-mode item is saved
- **THEN** no new code is minted and no label is printed as part of the save; the next label is only reserved and printed when the user taps "New item" again

#### Scenario: Save failure is recoverable

- **WHEN** the save request fails (e.g. network error)
- **THEN** the app shows an error, keeps the entered photo/description/box/code, and lets the user retry without re-capturing

#### Scenario: Exit the flow

- **WHEN** the user taps Done/close and no unsaved item input exists beyond an auto-printed label
- **THEN** the sheet closes to the idle screen

#### Scenario: Discard confirmation

- **WHEN** the user tries to leave the sheet after entering real input (a photo taken or description typed)
- **THEN** a discard confirmation is shown before the in-progress item is dropped

#### Scenario: Discarded code is reused

- **WHEN** an assign-mode item whose code was minted on open (e.g. `ITM-0068`) is discarded without saving
- **THEN** the reserved number is returned so the next item reuses it (the next code is `ITM-0068`, not `ITM-0069`)

## ADDED Requirements

### Requirement: Print-on-open item label (assign mode)

In `assign` mode the app SHALL mint the item code and print its label as soon as the capture sheet opens, so the label is available before the item is photographed. The print status SHALL be shown on a status line. Because the physical sticker is the purpose of assign mode, a printer problem SHALL be treated as a blocker: the label MUST be printed (or the user MUST acknowledge writing the code by hand) before the item can be saved. The status line SHALL offer a connect action when no printer is available, a retry action on failure, and a "write by hand" acknowledgment so a missing printer is not a dead end.

#### Scenario: Label prints on open

- **WHEN** the capture sheet opens in `assign` mode
- **THEN** the app mints an `ITM-` code and starts printing its label, showing "Printing…" then "Printed" on the status line

#### Scenario: No printer blocks save until handled

- **WHEN** the sheet is in `assign` mode and no printer covers item labels
- **THEN** the status line shows the missing-printer state with a connect action, "Save item" is disabled, and the user can either connect and print or tap "write by hand" to acknowledge and enable saving

#### Scenario: Print failure blocks save and offers retry

- **WHEN** the label print fails in `assign` mode
- **THEN** the status line shows the failure with a retry action, "Save item" stays disabled until the label prints or the user acknowledges writing the code by hand

### Requirement: Mode-aware code handling in the sheet

The capture sheet SHALL adapt its code step to the active labeling mode: `assign` mints and prints on open; `scan` replaces the code line with a live scan-sticker step that has a manual-entry fallback and performs no printing; `none` shows no code line and relies on the server minting a hidden code at save.

#### Scenario: Scan mode

- **WHEN** the sheet opens in `scan` mode
- **THEN** a live scan-sticker step is shown with a manual-entry fallback, no label is printed, and the scanned/entered code is used for the item

#### Scenario: None mode

- **WHEN** the sheet opens in `none` mode
- **THEN** no code line is shown, no code is minted on the device, and the server assigns a hidden code at save

### Requirement: Multiple photos per item

The capture sheet SHALL let the user attach more than one photo to an item: an empty state offers a single "Take photo" action, and once a photo exists the sheet SHALL show each photo as a thumbnail with a delete control plus an "add another" control. On save the first photo SHALL be sent with the item and any additional photos SHALL be uploaded as extra photos on the created item (best-effort, without blocking the save result).

#### Scenario: Add another photo

- **WHEN** the item already has at least one photo and the user taps the add-photo control and captures another
- **THEN** the new photo is appended and shown as an additional thumbnail

#### Scenario: Delete a photo

- **WHEN** the user taps the delete control on a photo thumbnail
- **THEN** that photo is removed from the item and the others are kept

#### Scenario: Extra photos uploaded on save

- **WHEN** an item with two or more photos is saved
- **THEN** the first photo is stored with the item on save and the remaining photos are attached to that item afterward

### Requirement: Save gating

The "Save item" action SHALL be enabled once a box is set and, unless in `none` mode, a valid item code is present; in `assign` mode the label MUST additionally be printed or acknowledged as hand-written (see print-on-open). Photo and description SHALL both be optional and SHALL NOT gate saving. When Save is disabled, the sheet SHALL indicate what is still required.

#### Scenario: Save enabled without a photo or description

- **WHEN** a box is set, (unless in none mode) a valid item code is present, and (in assign mode) the label is printed or acknowledged hand-written, but no photo or description has been added
- **THEN** "Save item" is enabled

#### Scenario: Save disabled without a box

- **WHEN** no box is set for the current item
- **THEN** "Save item" is disabled and the sheet indicates a box is needed
