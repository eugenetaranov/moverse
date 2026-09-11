# box-code-generation Delta

## MODIFIED Requirements

### Requirement: Next box code endpoint

The backend SHALL expose a `POST /next-box-code` endpoint that mints the next box code for the caller's current job as `BOX-nn` (zero-padded to at least 2 digits, growing naturally past 99), using an atomic per-job sequence (`UPDATE … RETURNING`) rather than scanning existing records. Concurrent calls SHALL never return the same code. Manually named boxes SHALL NOT affect the sequence. The endpoint SHALL require user authentication like all write endpoints.

#### Scenario: First box code in a job

- **WHEN** a job has minted no box codes
- **THEN** the endpoint returns `BOX-01`

#### Scenario: Concurrent minting is collision-free

- **WHEN** two crew phones request a box code for the same job at the same moment
- **THEN** they receive two different consecutive codes

#### Scenario: Sequences are per-job

- **WHEN** job A is at `BOX-07` and job B mints its first code
- **THEN** job B receives `BOX-01`, unaffected by job A

#### Scenario: Unauthenticated request is rejected

- **WHEN** a request arrives without a valid user token
- **THEN** the endpoint rejects it and no code is minted

### Requirement: On-device box code reservation

The app SHALL reserve `BOX-nn` codes for the print/write-before-save flow from the current job's server-side sequence, requesting a small reserved batch while online so reservations keep working offline. Reserved codes SHALL be monotonic within the job and never reused; abandoned reservations MAY leave gaps and SHALL NOT block subsequent reservations.

#### Scenario: Reservation uses the job sequence

- **WHEN** the job's next box code is `BOX-07` and the user reserves a new box code
- **THEN** the app hands out `BOX-07` and the server sequence advances so no other device receives it

#### Scenario: Reservation works offline from the batch

- **WHEN** the app holds a reserved batch and the device goes offline
- **THEN** reserving a new box code still yields the next reserved code without a network call
