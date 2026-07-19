## ADDED Requirements

### Requirement: Scan filtered by printer service UUID

Discovery SHALL scan for BLE devices filtered by the Niimbot service UUID rather than scanning all services and matching on name alone. Devices that do not advertise the service UUID SHALL NOT be treated as printer candidates.

#### Scenario: Non-printer devices are excluded

- **WHEN** a scan runs near phones, headphones, and other BLE devices that do not advertise the printer service UUID
- **THEN** none of them appear as printer candidates

#### Scenario: Renamed printer is still discoverable

- **WHEN** a supported printer has been renamed so its advertised name contains neither "b1" nor "niimbot"
- **THEN** it still appears as a candidate because it advertises the printer service UUID

### Requirement: Anchored name matching

When a device name is used to label or recognize a candidate, matching SHALL be anchored (prefix / word-boundary) rather than a bare substring, so short tokens do not collide with unrelated names.

#### Scenario: Substring collision is rejected

- **WHEN** a device is named "Room-B1" or "B18-print" and only a "b1" model token is expected
- **THEN** it is not misidentified as the "B1" model by the name alone

### Requirement: Candidate-count-driven connection

Discovery SHALL resolve the scan into a candidate set and act on its size: zero candidates SHALL yield a not-found result; exactly one candidate SHALL be auto-selected while still reporting which device was chosen; two or more candidates SHALL be returned as a list sorted by signal strength (RSSI, strongest first) for the user to choose. Discovery SHALL NOT silently connect to an arbitrary first match when multiple candidates exist.

#### Scenario: Single candidate auto-connects

- **WHEN** exactly one supported printer is found in a scan
- **THEN** it is selected automatically and the chosen device is reported to the UI

#### Scenario: Multiple candidates are offered as a sorted list

- **WHEN** two or more supported printers are found in a scan
- **THEN** the candidates are returned sorted by RSSI (strongest first) and none is connected until one is chosen

#### Scenario: No candidates found

- **WHEN** a scan completes with no device advertising the printer service UUID
- **THEN** discovery returns a not-found result rather than hanging or connecting to an unrelated device

### Requirement: Identity confirmed on connect

After establishing a GATT connection and discovering characteristics, discovery SHALL send a status handshake (`GET_STATUS`) and require a well-formed printer status reply before reporting the printer as ready. A candidate that connects but does not return a valid status reply SHALL NOT be reported as a ready printer.

#### Scenario: Valid status reply confirms the printer

- **WHEN** a candidate is connected and returns a well-formed status reply to the handshake
- **THEN** the printer is reported as connected and ready

#### Scenario: False-positive candidate is rejected

- **WHEN** a connected candidate does not return a valid printer status reply within the handshake window
- **THEN** it is not reported as a ready printer and is dropped from the candidate set

### Requirement: iOS name-at-scan handling

Discovery SHALL function on iOS, where a device's name may be unavailable during scanning. A candidate SHALL NOT be dropped solely because its name is null at scan time; the service-UUID filter SHALL be the primary discovery signal.

#### Scenario: Name-less candidate is retained

- **WHEN** on iOS a device advertises the printer service UUID but exposes no name during the scan
- **THEN** it is still retained as a candidate and labeled by whatever identity (RSSI / resolved name) is available

### Requirement: Persisted device for reconnect

On a successful connection, discovery SHALL persist the resolved device id (platform peripheral/address identifier) so a later session can attempt to reconnect to the same physical printer.

#### Scenario: Device id is stored after connecting

- **WHEN** a printer is connected and confirmed
- **THEN** its device id is persisted for later reconnect attempts
