# inventory-read-api Delta

## MODIFIED Requirements

### Requirement: List boxes endpoint

The backend SHALL provide a `GET /boxes` endpoint that returns the current job's boxes as JSON, each with its box code, name, type, destination, status, and the count of items linked to it. The endpoint SHALL require user authentication and derive the job scope server-side; it SHALL never expose database or storage credentials to the client.

#### Scenario: Boxes are returned with item counts

- **WHEN** the app requests `GET /boxes` for the current job
- **THEN** the response lists every box in that job with its code, name, type, destination, status, and item count — and no boxes from any other job or org

#### Scenario: Read secrets stay server-side

- **WHEN** the app calls `GET /boxes`
- **THEN** the request carries only the user's JWT and the response contains no credentials

### Requirement: List items endpoint

The backend SHALL provide a `GET /items` endpoint that returns the current job's items as JSON, each with its id, item code, description, box code(s), destination, and photo URLs (short-lived R2 presigned GET URLs minted server-side — a thumbnail and full-size variant). The endpoint SHALL accept an optional `box` query parameter to return only items linked to that box code within the job, and SHALL return the job's full item set (paginating internally as needed).

#### Scenario: All items are returned with photo and box membership

- **WHEN** the app requests `GET /items`
- **THEN** the response lists every item of the current job with its code, description, box code(s), destination, and signed photo URLs when photos exist

#### Scenario: Filter items to one box

- **WHEN** the app requests `GET /items?box=BOX-03`
- **THEN** only the current job's items linked to `BOX-03` are returned

#### Scenario: Item in multiple boxes lists all boxes

- **WHEN** an item is linked to two boxes in the job
- **THEN** its entry lists both box codes

#### Scenario: Signed photo URLs expire safely

- **WHEN** a signed photo URL from a previous session has expired
- **THEN** a fresh `GET /items` returns working URLs and the app renders photos again

## REMOVED Requirements

### Requirement: Read endpoints accept GET behind the shared secret

**Reason**: The shared `x-app-secret` gate is replaced by per-user JWT authentication on all endpoints (see `api-security`), and the previously committed secret is rotated out.
**Migration**: Clients send `Authorization: Bearer <supabase JWT>`; requests carrying only the old header are rejected as unauthenticated. GET remains the method for read endpoints.
