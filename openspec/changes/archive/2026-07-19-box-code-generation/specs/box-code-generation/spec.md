## ADDED Requirements

### Requirement: Next box code endpoint

The backend SHALL expose a `POST /next-box-code` endpoint that returns the next box code as `BOX-####` (zero-padded to at least 4 digits), computed as one above the highest numeric `BOX-` code in the Boxes table. Box codes that are not of the form `BOX-<digits>` (e.g. named boxes like "Kitchen") SHALL be ignored when computing the maximum. The endpoint SHALL be protected by the same app-secret guard as the other write endpoints.

#### Scenario: First box code

- **WHEN** the Boxes table contains no numeric `BOX-` codes
- **THEN** the endpoint returns `BOX-0001`

#### Scenario: Next after highest numeric code

- **WHEN** the highest numeric box code in the table is `BOX-0006`
- **THEN** the endpoint returns `BOX-0007`

#### Scenario: Named boxes are ignored

- **WHEN** the table contains `BOX-0002` and a named box `Kitchen`
- **THEN** the endpoint returns `BOX-0003` (the named box does not affect the maximum)

#### Scenario: Missing or invalid app secret

- **WHEN** a request omits or sends a wrong app secret
- **THEN** the endpoint is rejected by the guard and no code is returned

### Requirement: On-device box code reservation

The app SHALL maintain a monotonic box-code counter that hands out `BOX-####` codes for the print/write-before-save flow. The counter SHALL be seeded from the backend's current maximum (via the next-box-code endpoint) and SHALL increment on each reservation. Abandoned reservations MAY leave gaps in the sequence and SHALL NOT block subsequent reservations.

#### Scenario: First reservation after seeding

- **WHEN** the backend's next box code is `BOX-0007` and the user reserves a new box code
- **THEN** the app hands out `BOX-0007`

#### Scenario: Consecutive reservations are monotonic

- **WHEN** the user reserves two new box codes in a row starting from `BOX-0007`
- **THEN** the app hands out `BOX-0007` then `BOX-0008` without reuse

#### Scenario: Seeding is unavailable

- **WHEN** the next-box-code request fails and no counter has been seeded yet
- **THEN** reservation still yields a valid `BOX-####` code (falling back to a zero seed) rather than failing

### Requirement: Create a new box from the box-assignment step

The box-assignment ("Which box?") step SHALL offer a "New box" action that auto-generates a box code, in addition to the existing scan-an-existing-`BOX-`-label and free-type-a-name paths. The action's behavior SHALL follow the active labeling mode (the same modes used for items):

- In **assign** mode the app SHALL reserve a `BOX-####` code, then print it if a label printer is connected or otherwise present a "Write this on the box" screen showing the code, and then set that code as the current box.
- In **none** mode the app SHALL create the box with a server-minted `BOX-####` code at save time; no label is printed.
- In **scan** mode the primary path remains scanning a pre-printed `BOX-` label; the "New box" action is not required.

#### Scenario: New box in assign mode with a connected printer

- **WHEN** the labeling mode is "assign", a printer is connected, and the user taps "New box"
- **THEN** the app reserves the next `BOX-####`, prints a label for it, sets it as the current box, and returns to the capture hub

#### Scenario: New box in assign mode without a printer

- **WHEN** the labeling mode is "assign", no printer is connected, and the user taps "New box"
- **THEN** the app reserves the next `BOX-####` and shows a "Write this on the box" screen with the code, and sets it as the current box when the user confirms

#### Scenario: New box in none mode

- **WHEN** the labeling mode is "none" and the user chooses to start a new box
- **THEN** a `BOX-####` code is minted server-side when the first item is saved to it, with no label printed

#### Scenario: Scanning an existing box label still works

- **WHEN** the user scans a pre-printed `BOX-0003` label in the box-assignment step
- **THEN** the app sets `BOX-0003` as the current box (unchanged behavior)

### Requirement: Auto-generated box codes are well-formed

Every auto-generated box code SHALL be of the form `BOX-####` with the `BOX-` prefix and a zero-padded numeric suffix, so it is recognized as a box (not an item or a free-typed name) by the app's label classifier and persisted verbatim as the box's `Box Code`.

#### Scenario: Reserved code is recognized as a box

- **WHEN** the app auto-generates a box code
- **THEN** the resulting code starts with `BOX-`, classifies as a box label, and is stored as the box's `Box Code`
