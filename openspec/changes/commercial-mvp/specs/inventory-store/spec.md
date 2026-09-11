# inventory-store Delta

## MODIFIED Requirements

### Requirement: Inventory data model

The system SHALL store inventory in Postgres (Supabase) under the tenant hierarchy **org → job → boxes/items**. **Boxes**: id, `job_id`, `code` (matches a `BOX-` label), `type` (Suitcase | Shipping box), `destination` (With me | Shipment), `name`, `status` (`packing` | `sealed` | `loaded` | `delivered`). **Items**: id, `job_id`, `code` (matches an `ITM-` label), `description`, created time, links to one or more boxes via an `item_boxes` join table, and photos stored in Cloudflare R2 (object keys referenced by a `photos` table). An item's destination SHALL derive from its box(es). Every row SHALL be traceable to its org (via the job) and row-level security SHALL enforce org isolation as a second line of defense behind the API.

#### Scenario: Item is linked to its box

- **WHEN** an item is saved with box `BOX-03` in job J
- **THEN** the item row belongs to job J, an `item_boxes` row links it to that box, and its destination reflects the box's destination

#### Scenario: Tenant isolation at the storage layer

- **WHEN** a query runs with a user-scoped connection for org A
- **THEN** row-level security prevents any org-B rows from being returned even if the query forgets a filter

### Requirement: Persist a captured item with its photo

The system SHALL provide a `/save` endpoint that persists a captured item within the caller's current job: it ensures the destination box exists in that job (creating a stub if needed), creates the item with its code and description, and stores the photo(s) in R2 linked to the item (recording the object key in the `photos` table). The endpoint SHALL require user authentication, derive org/job scope server-side, and accept a client idempotency key so offline-queue retries upsert instead of duplicating. Database and storage credentials SHALL stay server-side.

#### Scenario: Save creates an item with photo and box link

- **WHEN** the app posts item code, box code, description, and photo to `/save` for the current job
- **THEN** an item is created in that job with the description, linked to the box, and the photo is retrievable via a signed URL

#### Scenario: Unknown box is created as a stub

- **WHEN** `/save` references a box code that has no record in the current job
- **THEN** a box is created for that code within the job and the item is linked to it

#### Scenario: Idempotent replay

- **WHEN** the same save (same idempotency key) arrives twice
- **THEN** exactly one item exists afterward

#### Scenario: Save secrets stay server-side

- **WHEN** the app calls `/save`
- **THEN** the request carries only the user's JWT; database, storage, and Anthropic credentials are held only by the backend

### Requirement: Browse inventory by box and by destination

The inventory store SHALL support browsing scoped to one job that answers "what went where" and "what is coming with me": a photo-card view grouped by box, and a filter that shows only items whose destination is "With me".

#### Scenario: Browse items grouped by box with photos

- **WHEN** the user opens the browse view for the current job
- **THEN** each of that job's items appears as a photo card under its box, and no other job's data appears

#### Scenario: Filter to items coming with me

- **WHEN** the user applies the "With me" destination filter
- **THEN** only the current job's items in "With me" boxes are listed

## ADDED Requirements

### Requirement: Migration of the founder's Airtable data

A one-time migration SHALL import the existing Airtable base (boxes, items, photos) into the founder's personal org as one job, preserving codes, descriptions, box links, statuses, and photo files. Airtable SHALL be frozen read-only after migration and retired once parity is confirmed.

#### Scenario: Migrated data is complete

- **WHEN** the migration script completes
- **THEN** every Airtable item and box exists under the founder's job with matching codes, links, and downloadable photos, and a count comparison shows zero missing records
