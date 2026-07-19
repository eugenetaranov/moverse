# label-scanning Specification

## Purpose
TBD - created by archiving change moverse-mvp. Update Purpose after archive.
## Requirements
### Requirement: Scan and route QR codes by prefix

The app SHALL scan QR codes with the device camera and route the decoded value by its prefix: `ITM-` identifies an item label and `BOX-` identifies a box/suitcase label. When a scan step expects a specific type, the app SHALL reject a code of the wrong type with a clear message and remain on that step.

#### Scenario: Scan an item label when an item is expected

- **WHEN** the item-scan step is active and the user scans a QR code decoding to `ITM-0007`
- **THEN** the app accepts it, records the item code, and advances to the photo step

#### Scenario: Scan a box label when a box is expected

- **WHEN** the box-assignment step is active and the user scans a QR code decoding to `BOX-0003`
- **THEN** the app accepts it and records `BOX-0003` as the destination box

#### Scenario: Wrong-type code is rejected

- **WHEN** the box-assignment step is active and the user scans a code decoding to `ITM-0007`
- **THEN** the app shows a message indicating a box label is expected and does not advance

#### Scenario: Unrecognized code is rejected

- **WHEN** any scan step is active and the user scans a code that does not start with `ITM-` or `BOX-`
- **THEN** the app shows an "unrecognized label" message and does not advance

### Requirement: Camera permission

The app SHALL request camera permission before scanning and SHALL show an actionable message if permission is denied.

#### Scenario: Permission granted

- **WHEN** the user opens a scan step and grants camera permission
- **THEN** the live camera preview appears and scanning is active

#### Scenario: Permission denied

- **WHEN** camera permission is denied
- **THEN** the app displays a message explaining camera access is required and offers a way to retry or open settings

