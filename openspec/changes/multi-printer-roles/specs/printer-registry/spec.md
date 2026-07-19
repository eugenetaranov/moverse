## ADDED Requirements

### Requirement: Multiple concurrent printer connections

The app SHALL support more than one printer connected at the same time. Connecting
an additional printer SHALL NOT disconnect any already-connected printer. Each
connected printer SHALL have its own transport, client, and notification
subscription so that its traffic and disconnects are independent of the others.

#### Scenario: Adding a second printer keeps the first

- **WHEN** one printer is already connected and the user connects a second printer
- **THEN** both printers are connected and usable, and neither drops as a result of the other connecting

#### Scenario: One printer dropping leaves the other connected

- **WHEN** two printers are connected and one powers off or leaves BLE range
- **THEN** only that printer is removed from the connected set and the other remains connected and usable

### Requirement: Managed printer identity

Each connected printer SHALL be tracked by a stable device id (BLE peripheral /
address) and carry its advertised name and detected model. The connected set SHALL
be keyed by device id so the same physical printer is never represented twice.

#### Scenario: Reconnecting the same printer does not duplicate it

- **WHEN** a printer that is already in the connected set is connected again
- **THEN** it remains a single entry keyed by its device id rather than appearing twice

### Requirement: Observable connected set

The connection layer SHALL expose the connected set as an observable that emits on
any change to the set (a printer added, removed, or its role changed), so the UI
re-renders to reflect the current printers.

#### Scenario: UI updates when a printer is added or removed

- **WHEN** a printer is connected or disconnected
- **THEN** subscribed views re-render to show the updated set of printers

### Requirement: Persisted printer set and reconnect

The set of known printers (device id, name, detected model) SHALL be persisted and,
on entering the printer settings or before a print, the app SHALL attempt to
reconnect the remembered printers in the background. A single previously-remembered
printer from the earlier one-printer model SHALL migrate into the set as one entry.

#### Scenario: Remembered printers reconnect on next launch

- **WHEN** two printers were connected and persisted, and the app is relaunched
- **THEN** the app attempts to reconnect both remembered printers without the user re-selecting them

#### Scenario: Legacy single printer migrates into the set

- **WHEN** the app previously remembered exactly one printer under the old single-connection storage
- **THEN** it loads as one entry in the new printer set with no data loss

### Requirement: Per-printer disconnect

The app SHALL allow disconnecting an individual printer by device id without
affecting the other connected printers, and SHALL allow forgetting it so it is not
reconnected automatically.

#### Scenario: Disconnect one of two printers

- **WHEN** two printers are connected and the user disconnects one
- **THEN** that printer is removed from the connected set and the other remains connected
