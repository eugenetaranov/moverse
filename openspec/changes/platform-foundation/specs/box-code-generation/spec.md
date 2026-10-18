# box-code-generation Delta

## MODIFIED Requirements

### Requirement: Next box code endpoint

The backend SHALL mint box codes for the current job as `BOX-nn` (zero-padded to at least 2 digits, growing past 99) from an atomic per-job sequence, never by scanning records. `POST /next-box-code` SHALL remain as a compatibility endpoint equivalent to reserving one box code. Named boxes (non-numeric codes) SHALL NOT affect the sequence. A numeric box code saved from a label SHALL advance the sequence to at least that number. The endpoint SHALL require user authentication and job access.

#### Scenario: First box code

- **WHEN** a job has minted no box codes
- **THEN** the endpoint returns `BOX-01`

#### Scenario: Next after highest numeric code

- **WHEN** the job's highest numeric box code is `BOX-06`
- **THEN** the endpoint returns `BOX-07`

#### Scenario: Named boxes are ignored

- **WHEN** the job contains `BOX-02` and a named box `Kitchen`
- **THEN** the endpoint returns `BOX-03`

#### Scenario: Missing or invalid app secret

- **WHEN** a request has no valid user token (the old app secret is no longer accepted)
- **THEN** it is rejected with 401 and no code is minted

#### Scenario: Concurrent minting is collision-free

- **WHEN** two phones request a box code for the same job at the same moment
- **THEN** they receive different codes

### Requirement: On-device box code reservation

The app SHALL hand out codes for the print/write-before-save flow from a persisted pool for each job and kind (box and item). The pool SHALL be filled by `POST /codes/reserve { kind, count ≤ 200 }`, which atomically advances the job's sequence and returns a contiguous range, so ranges held by different devices never overlap. The app SHALL take codes locally, including offline, and refill in the background when fewer than 10 remain and it is online. Only the most recently handed-out code MAY be released back. Gaps from abandoned codes SHALL be allowed. Pools SHALL be cleared on sign-out.

#### Scenario: First reservation after seeding

- **WHEN** the job's next box number is 7 and the pool is empty, and the user reserves a new box code online
- **THEN** the app fills a pool starting at `BOX-07` and hands out `BOX-07`

#### Scenario: Consecutive reservations are monotonic

- **WHEN** the user reserves two box codes in a row
- **THEN** the app hands out two consecutive codes from its pool without reuse

#### Scenario: Seeding is unavailable

- **WHEN** the device is offline and the pool for the job is empty
- **THEN** reservation fails with a clear "connect once to get codes" message instead of inventing a code that could collide

#### Scenario: Two phones on one job

- **WHEN** two crew phones each fill a box pool for the same job
- **THEN** their pools hold non-overlapping ranges, and labels printed on either phone never repeat a code

### Requirement: Auto-generated box codes are well-formed

Every auto-generated box code SHALL be `BOX-` followed by a zero-padded number of at least 2 digits, so the label classifier recognizes it as a box (not an item or a free-typed name). It SHALL be stored verbatim as the box's `code` in its job.

#### Scenario: Reserved code is recognized as a box

- **WHEN** the app auto-generates a box code
- **THEN** the code starts with `BOX-`, classifies as a box label, and is stored as the box's code
