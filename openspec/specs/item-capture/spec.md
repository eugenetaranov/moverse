# item-capture Specification

## Purpose
TBD - created by archiving change moverse-mvp. Update Purpose after archive.
## Requirements
### Requirement: Guided item capture workflow

The app SHALL guide the user through capturing a packed item in this order: (1) scan the item's `ITM-` QR label, (2) take a photo of the item, (3) confirm or edit the auto-generated description, (4) scan the destination `BOX-` QR label, (5) save. On successful save the app SHALL confirm success and return to step 1 for the next item.

#### Scenario: Complete capture end to end

- **WHEN** the user scans an item label, takes a photo, accepts the description, and scans a box label, then confirms save
- **THEN** the item is persisted with its photo, description, and box link, a success confirmation is shown, and the app returns to the item-scan step

#### Scenario: Save failure is recoverable

- **WHEN** the save request fails (e.g. network error)
- **THEN** the app shows an error, keeps the entered photo/description/box, and lets the user retry without re-capturing

### Requirement: Photo capture

During the photo step the app SHALL capture a photo of the item and downscale/compress it before it leaves the device.

#### Scenario: Take a photo

- **WHEN** the photo step is active and the user takes a picture
- **THEN** the app captures the image, downscales it (long edge ~1024px, JPEG-compressed), and proceeds to request a description

#### Scenario: Retake a photo

- **WHEN** a photo has been captured and the user chooses to retake
- **THEN** the previous photo is discarded and the camera returns to capture mode

### Requirement: Description confirmation

The app SHALL present the auto-generated description in an editable field and SHALL use the final field value (edited or not) when saving.

#### Scenario: Accept the generated description

- **WHEN** the description is generated and the user leaves it unchanged and continues
- **THEN** the generated text is used for the item

#### Scenario: Edit the generated description

- **WHEN** the user edits the description text before continuing
- **THEN** the edited text is used for the item instead of the generated text

