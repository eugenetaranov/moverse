# offline-capture Delta

## ADDED Requirements

### Requirement: Durable local save queue

Item saves (record + photos) SHALL append to a durable on-device queue and return success to the capture flow immediately. A background drainer SHALL sync queued saves to the API with retry and exponential backoff, preserving order per job. The queue SHALL survive app restarts and device reboots. Every queued save SHALL carry a client-generated idempotency key (UUID) which the server upserts on, so retries can never create duplicates.

#### Scenario: Packing in a dead zone

- **WHEN** the user captures five items in a basement with no connectivity
- **THEN** all five save locally without errors, packing continues uninterrupted, and all five sync exactly once when connectivity returns

#### Scenario: Retry cannot duplicate

- **WHEN** a sync request succeeds server-side but the response is lost and the client retries
- **THEN** the server recognizes the idempotency key and no duplicate item is created

### Requirement: Sync state is visible

The app SHALL show per-item sync state (queued vs synced) and an unobtrusive aggregate indicator (e.g. "3 items waiting to sync") with a manual retry affordance when the drainer has backed off.

#### Scenario: User sees pending items

- **WHEN** items are waiting in the queue
- **THEN** the Pack screen shows the pending count, and each affected item is marked queued until synced

### Requirement: Offline browse from cache

Browse SHALL render from a locally cached snapshot of the current job's inventory when offline (photos may be thumbnails-only), refreshing the cache whenever online fetches succeed.

#### Scenario: Browse without signal

- **WHEN** the user opens Browse offline
- **THEN** the last-synced boxes and items for the current job are shown with an offline indicator, instead of an error screen

### Requirement: Codeless mode works offline via reserved batches

In codeless (no-label) mode the app SHALL reserve a batch of item codes for the current job while online and consume them for offline captures, so server-minted codes are never invented on-device and cannot collide.

#### Scenario: Codeless capture offline

- **WHEN** a codeless-mode user captures items offline with a reserved batch available
- **THEN** each item gets the next reserved code, and after sync the server records match those codes with no collisions
