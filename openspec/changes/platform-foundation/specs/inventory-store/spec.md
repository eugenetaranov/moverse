# inventory-store Delta

## MODIFIED Requirements

### Requirement: Inventory data model

The system SHALL store inventory in Postgres (Supabase) under org → job. **Boxes**: id, `job_id`, `code` (unique in the job; matches a `BOX-` label or a free-typed name), numeric `code_seq` when the code is numeric, `type` (suitcase | shipping_box), `destination` (with_me | shipment), `name`, `status` (packing | sealed | loaded | delivered) with timestamps for each status change, and `created_by`. **Items**: a client-generated UUID id, `job_id`, `code` (unique in the job; matches an `ITM-` label), `code_seq`, `description`, `created_by` and created time. Items link to one or more boxes of the **same job** through `item_boxes`, and have photos stored in R2 and referenced by `photos`. An item's destination SHALL derive from its box(es). Cross-job links SHALL be impossible by constraint.

#### Scenario: Item is linked to its box

- **WHEN** an item is saved with box `BOX-03` in job J
- **THEN** the item belongs to job J, an `item_boxes` row links it to J's `BOX-03`, and its destination reflects that box's destination

### Requirement: Persist a captured item with its photo

The system SHALL provide `POST /save` that persists a captured item in the current job (from the `X-Moverse-Job` header), atomically in one database transaction. It SHALL accept `{ itemId, itemCode?, boxCode?, newBox?, description, photoIds[] }`, where `itemId` is a client-generated UUID and photos were uploaded beforehand (photo-storage).

The behavior SHALL be:

- Ensure the box exists in the job, creating a stub for an unknown code or minting a code when `newBox` is set.
- If `itemId` already exists, treat the request as a replay: ensure the box link and photos are attached, create nothing new, and return `exists`.
- If `itemCode` belongs to another item in the job, union the box into that item (`added` or `exists`) and return that item's id.
- Otherwise create the item, minting `ITM-nnnn` if no code was given (`created`).
- A supplied numeric code SHALL advance the job's sequence so later mints cannot collide.

The response SHALL keep the `{ itemId, itemCode, boxCode, action }` shape. Only the user's token SHALL travel from the app; database, storage and AI credentials SHALL stay server-side.

#### Scenario: Save creates an item with photo and box link

- **WHEN** the app posts a new `itemId`, item code, box code, description and one uploaded photo id
- **THEN** the item is created in the current job with the description, linked to the box, and the photo is attached and served by signed URL

#### Scenario: Unknown box is created as a stub

- **WHEN** `/save` references a box code that does not exist in the current job
- **THEN** a box with that code is created in the job and the item is linked to it

#### Scenario: Save secrets stay server-side

- **WHEN** the app calls `/save`
- **THEN** the request carries only the user's access token, and no database, R2 or Anthropic credential is sent to or held by the app

#### Scenario: Replay is idempotent

- **WHEN** the same `/save` request (same `itemId`) is delivered twice
- **THEN** exactly one item exists and the second response reports `exists`

#### Scenario: Hand-written code advances the sequence

- **WHEN** an item is saved with code `ITM-0500` while the job sequence is at 120
- **THEN** the next minted item code in that job is `ITM-0501`

### Requirement: Browse inventory by box and by destination

The inventory store SHALL support browsing of the current job only, answering "what went where" and "what is coming with me": a photo-card view grouped by box, and a filter that shows only items whose destination is "With me".

#### Scenario: Browse items grouped by box with photos

- **WHEN** the user opens the gallery grouped by box
- **THEN** each of the current job's items appears as a photo card under its box, and no other job's data appears

#### Scenario: Filter to items coming with me

- **WHEN** the user applies the "With me" destination filter
- **THEN** only the current job's items in "With me" boxes are listed
