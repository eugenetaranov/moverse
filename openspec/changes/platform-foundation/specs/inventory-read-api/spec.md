# inventory-read-api Delta

## MODIFIED Requirements

### Requirement: List boxes endpoint

The backend SHALL provide `GET /boxes` returning all boxes of the current job as JSON, each with its box code, name, type, destination, status and item count, sorted by numeric code (highest first) with named boxes after. No database or storage credential SHALL be exposed to the client.

#### Scenario: Boxes are returned with item counts

- **WHEN** the app requests `GET /boxes` for job J
- **THEN** the response lists every box in J with its code, name, type, destination, status and item count, and no box from another job

#### Scenario: Read secrets stay server-side

- **WHEN** the app calls `GET /boxes`
- **THEN** the request carries only the user's access token and the response contains no secret

### Requirement: List items endpoint

The backend SHALL provide `GET /items` returning the current job's items, each with its id (UUID), item code, description, box codes, destination, a thumbnail URL, a full photo URL and all photo URLs. All URLs SHALL be R2 presigned GET URLs valid for 1 hour. It SHALL accept an optional `box` query parameter to return only items linked to that box code. Results SHALL cover the whole job, with no truncation at any page size.

#### Scenario: All items are returned with photo and box membership

- **WHEN** the app requests `GET /items`
- **THEN** the response lists every item in the current job with code, description, box codes, destination, and thumbnail and photo URLs when it has photos

#### Scenario: Filter items to one box

- **WHEN** the app requests `GET /items?box=BOX-03`
- **THEN** only the current job's items linked to `BOX-03` are returned

#### Scenario: Item in multiple boxes lists all boxes

- **WHEN** an item is linked to two boxes
- **THEN** its entry lists both box codes

#### Scenario: More than one page of items

- **WHEN** the job has more items than one database page
- **THEN** the response includes all of them

### Requirement: Update item endpoint

The backend SHALL provide `POST /item-update` accepting `{ itemId, description?, boxCodes? }` for an item in the current job. When `description` is present it SHALL update the description. When `boxCodes` is present it SHALL set the item's box links to exactly those boxes of the current job, creating stub boxes for unknown codes. Absent fields SHALL be left unchanged. The update SHALL be atomic.

#### Scenario: Update description only

- **WHEN** the app posts `{ itemId, description: "Blue winter coat" }`
- **THEN** the description is updated and the box links are unchanged

#### Scenario: Set box links (add or move)

- **WHEN** the app posts `{ itemId, boxCodes: ["BOX-03", "BOX-07"] }`
- **THEN** the item is linked to exactly those two boxes in the current job

#### Scenario: Unknown box code is created as a stub

- **WHEN** `boxCodes` references a code with no box in the current job
- **THEN** a box with that code is created in the job and the item is linked to it

### Requirement: Update box endpoint

The backend SHALL provide `POST /box-update` accepting `{ boxCode, name?, type?, destination?, status? }`. It SHALL locate the box by code in the current job, creating a stub if missing, and update only the fields present. A status change SHALL record the time of that change.

#### Scenario: Update box metadata

- **WHEN** the app posts `{ boxCode: "BOX-03", name: "Winter clothes", destination: "with_me" }`
- **THEN** that box's name and destination are updated and its other fields are unchanged

#### Scenario: Absent fields are left unchanged

- **WHEN** the app posts `{ boxCode: "BOX-03", name: "Winter clothes" }`
- **THEN** only the name changes; type, destination and status keep their values

## REMOVED Requirements

### Requirement: Read endpoints accept GET behind the shared secret

**Reason**: The shared `x-app-secret` is replaced by per-user tokens and job scoping.

**Migration**: Clients send `Authorization: Bearer <token>` and `X-Moverse-Job`. Reads stay GET and writes stay POST (see "Reads and writes are user-authenticated and job-scoped").

## ADDED Requirements

### Requirement: Reads and writes are user-authenticated and job-scoped

`GET /boxes` and `GET /items` SHALL accept GET, and the write endpoints SHALL remain POST-only. All of them SHALL require a valid user token and an accessible job in `X-Moverse-Job`. Item and box deletes SHALL require the owner or admin role.

#### Scenario: GET is allowed for reads

- **WHEN** the app issues an authenticated `GET /items` with a job header
- **THEN** the request is served

#### Scenario: Missing token is rejected

- **WHEN** a request to `/items` has no valid user token
- **THEN** it is rejected with 401

#### Scenario: Crew delete is refused

- **WHEN** a crew member posts to `/item-delete`
- **THEN** the API responds 403 and the item remains
