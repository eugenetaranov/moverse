# client-report Delta

## ADDED Requirements

### Requirement: Shareable read-only report link per job

Each job SHALL have a report link containing an unguessable token, viewable without any account: a web page listing the job's boxes with their items, photos, descriptions, and box statuses, ordered by box code. Owners/admins SHALL be able to copy/share the link from the app or web dashboard, and regenerate the token (invalidating the old link) at any time. Photos on the report SHALL be served via signed, expiring URLs generated at render time — never public bucket URLs.

#### Scenario: Client opens the report

- **WHEN** a client opens the job's report link in a browser with no account
- **THEN** they see every box with its code, name, status, and the items inside with photos and descriptions

#### Scenario: Regenerating the token kills the old link

- **WHEN** an admin regenerates the job's report token
- **THEN** the previous link stops working and the new link shows the same report

#### Scenario: Report reflects current state

- **WHEN** the crew seals two more boxes and marks one delivered after the link was shared
- **THEN** reloading the report shows the updated statuses without a new link

### Requirement: Printable report layout

The report page SHALL provide a print-friendly layout (via print stylesheet) suitable for saving as PDF: one section per box, item thumbnails, and a summary header with job name, box count, item count, and generation date.

#### Scenario: Print to PDF

- **WHEN** the client uses the browser's print function on the report
- **THEN** the output paginates cleanly by box with the summary header on page one and no navigation chrome

### Requirement: Box check-off visible on the report

The report SHALL surface each box's lifecycle status (`packing`, `sealed`, `loaded`, `delivered`) and a delivery summary (e.g. "17 of 19 boxes delivered"), so the link doubles as proof of packing and delivery reconciliation for the client.

#### Scenario: Delivery reconciliation

- **WHEN** 17 of 19 boxes are marked delivered
- **THEN** the report header shows the 17/19 count and the two undelivered boxes are visually distinguishable
