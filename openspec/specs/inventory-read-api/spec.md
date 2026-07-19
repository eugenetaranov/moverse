# inventory-read-api Specification

## Purpose
TBD - created by archiving change browse-inventory. Update Purpose after archive.
## Requirements
### Requirement: List boxes endpoint

The backend SHALL provide a `GET /boxes` endpoint that returns all boxes as JSON, each with its box code, name/notes, type, destination, status, and the count of items linked to it. The endpoint SHALL NOT expose the Airtable token to the client.

#### Scenario: Boxes are returned with item counts

- **WHEN** the app requests `GET /boxes`
- **THEN** the response lists every box with its code, name, type, destination, status, and item count

#### Scenario: Read secrets stay server-side

- **WHEN** the app calls `GET /boxes`
- **THEN** the request carries no Airtable token and the response contains no secret; the token is held only by the backend

### Requirement: List items endpoint

The backend SHALL provide a `GET /items` endpoint that returns items as JSON, each with its record id, item code, description, box code(s) it is linked to, destination, and a photo thumbnail URL (from the Airtable attachment's thumbnails) plus a full photo URL when available. The endpoint SHALL accept an optional `box` query parameter to return only items linked to that box code. Results SHALL cover the full table (paginating the Airtable API as needed).

#### Scenario: All items are returned with photo and box membership

- **WHEN** the app requests `GET /items`
- **THEN** the response lists every item with its code, description, box code(s), destination, and a photo thumbnail URL when the item has a photo

#### Scenario: Filter items to one box

- **WHEN** the app requests `GET /items?box=BOX-0003`
- **THEN** only items linked to `BOX-0003` are returned

#### Scenario: Item in multiple boxes lists all boxes

- **WHEN** an item is linked to two boxes
- **THEN** its entry lists both box codes

#### Scenario: More than one page of items

- **WHEN** the table has more than one page of records
- **THEN** the response includes items from all pages, not just the first

### Requirement: Update item endpoint

The backend SHALL provide a `POST /item-update` endpoint accepting `{ itemId, description?, boxCodes? }`. When `description` is present it SHALL update the item's description. When `boxCodes` is present it SHALL set the item's box links to exactly those boxes, creating a stub box for any code that does not yet exist (reusing the find-or-create-box behavior). Absent fields SHALL be left unchanged. Secrets SHALL stay server-side.

#### Scenario: Update description only

- **WHEN** the app posts `{ itemId, description: "Blue winter coat" }`
- **THEN** the item's description is updated and its box links are unchanged

#### Scenario: Set box links (add or move)

- **WHEN** the app posts `{ itemId, boxCodes: ["BOX-0003", "BOX-0007"] }`
- **THEN** the item is linked to exactly those two boxes

#### Scenario: Unknown box code is created as a stub

- **WHEN** `boxCodes` references a box code that has no record
- **THEN** a box record is created for that code and the item is linked to it

### Requirement: Update box endpoint

The backend SHALL provide a `POST /box-update` endpoint accepting `{ boxCode, name?, type?, destination?, status? }`. It SHALL locate the box by its code (creating a stub if missing) and update whichever of `Name / Notes`, `Type`, `Destination`, and `Status` are present, leaving absent fields unchanged. Secrets SHALL stay server-side.

#### Scenario: Update box metadata

- **WHEN** the app posts `{ boxCode: "BOX-0003", name: "Winter clothes", destination: "With me" }`
- **THEN** that box's name and destination are updated and its other fields are unchanged

#### Scenario: Absent fields are left unchanged

- **WHEN** the app posts `{ boxCode: "BOX-0003", name: "Winter clothes" }`
- **THEN** only the name is updated; type, destination, and status keep their existing values

### Requirement: Read endpoints accept GET behind the shared secret

The read endpoints (`GET /boxes`, `GET /items`) SHALL be reachable with the `GET` method, and when a shared app secret is configured they SHALL still require the `x-app-secret` header. The write endpoints (including `POST /item-update`) SHALL remain POST-only.

#### Scenario: GET is allowed for reads

- **WHEN** the app issues a `GET` request to `/items`
- **THEN** the request is served rather than rejected as a disallowed method

#### Scenario: Missing shared secret is rejected

- **WHEN** a shared app secret is configured and a request omits the `x-app-secret` header
- **THEN** the request is rejected as unauthorized

