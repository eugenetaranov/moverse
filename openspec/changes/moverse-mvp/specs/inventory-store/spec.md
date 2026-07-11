## ADDED Requirements

### Requirement: Inventory data model

The system SHALL store inventory in two linked tables. **Boxes**: `Box Code` (primary, matches a `BOX-` label), `Type` (Suitcase | Shipping box), `Destination` (With me | Shipment), `Name / Notes`, `Status`, and a link to Items. **Items**: `Item Code` (primary, matches an `ITM-` label), `Photo` (attachment), `Description`, a single link to a Box, `Destination` (looked up from the linked Box), and `Created` time.

#### Scenario: Item is linked to its box

- **WHEN** an item is saved with box `BOX-0003`
- **THEN** the item record links to the `BOX-0003` box record and its `Destination` reflects that box's destination

### Requirement: Persist a captured item with its photo

The system SHALL provide a `/save` endpoint that persists a captured item: it ensures the destination box record exists (creating a stub if needed), creates the item record with its code, description, and box link, and uploads the photo to the item's `Photo` attachment field. Secrets SHALL stay server-side.

#### Scenario: Save creates an item with photo and box link

- **WHEN** the app posts item code, box code, description, and base64 photo to `/save`
- **THEN** an item record is created with the description, linked to the box, and the photo appears in its `Photo` attachment field

#### Scenario: Unknown box is created as a stub

- **WHEN** `/save` references a box code that has no existing record
- **THEN** a box record is created for that code and the item is linked to it

#### Scenario: Save secrets stay server-side

- **WHEN** the app calls `/save`
- **THEN** the request does not contain the Airtable token; the token is held only by the proxy

### Requirement: Browse inventory by box and by destination

The inventory store SHALL support browsing that answers "what went where" and "what is coming with me": a photo-card view grouped by box, and a filter that shows only items whose destination is "With me".

#### Scenario: Browse items grouped by box with photos

- **WHEN** the user opens the gallery view grouped by box
- **THEN** each item appears as a photo card under its box

#### Scenario: Filter to items coming with me

- **WHEN** the user applies the "With me" destination filter
- **THEN** only items in suitcases (destination "With me") are listed
