## ADDED Requirements

### Requirement: No vendor picker; model shown after recognition

The connect flow SHALL NOT present a vendor/brand selection list before or during scanning. The section header SHALL NOT hardcode a single model name; the recognized model SHALL instead be shown in the connected status. A passive "Supported printers" reference link MAY appear on empty and not-found states as a support/marketing surface only.

#### Scenario: No brand list before scanning

- **WHEN** the user opens the printer section and starts connecting
- **THEN** no vendor/brand picker is shown; the flow goes straight to scanning

#### Scenario: Recognized model shown in connected status

- **WHEN** a printer is connected and its model is recognized
- **THEN** the connected status shows the recognized model name rather than the header asserting a fixed model

### Requirement: Device-picker state for multiple candidates

When discovery returns more than one candidate, the UI SHALL present a device list sorted by signal strength for the user to choose from, and SHALL connect only to the chosen device. When exactly one candidate is found, the UI SHALL show which device is being connected while auto-connecting.

#### Scenario: Choosing among multiple printers

- **WHEN** discovery returns two or more candidates
- **THEN** the UI shows a list sorted by signal strength and connects only to the one the user taps

#### Scenario: Single candidate is shown while auto-connecting

- **WHEN** discovery returns exactly one candidate
- **THEN** the UI shows that device and connects to it automatically without a manual pick

### Requirement: Permission-denied and Bluetooth-off are distinct

The UI SHALL distinguish Bluetooth permission being denied from the Bluetooth adapter being off, and SHALL present the appropriate recovery for each rather than a generic failure. Permission-denied SHALL offer a way to open system settings and retry; adapter-off SHALL prompt to turn Bluetooth on.

#### Scenario: Permission denied

- **WHEN** the user has denied Bluetooth permission
- **THEN** the UI explains permission is needed and offers "Open Settings" and "Try again", not a raw error

#### Scenario: Bluetooth adapter off

- **WHEN** Bluetooth is turned off at the OS level
- **THEN** the UI prompts the user to turn Bluetooth on, distinct from the permission-denied message

### Requirement: No-printer-found recovery

When a scan finds no candidate, the UI SHALL show an actionable recovery state with a short checklist of common causes (printer off, out of range, connected to another app) and a "Search again" action, rather than a blank or indefinite spinner.

#### Scenario: Scan finds nothing

- **WHEN** a scan completes with no candidate
- **THEN** the UI shows a "no printer found" state with a checklist and a "Search again" action

### Requirement: Remembered-device auto-reconnect

The UI SHALL attempt to reconnect to the last-connected printer automatically when the printer section is entered or before a print, without requiring a manual "Connect" tap. If auto-reconnect fails, the UI SHALL fall back to a state offering "Reconnect" rather than the cold empty state.

#### Scenario: Silent reconnect on return

- **WHEN** the user re-enters the printer section and a previously-connected printer is available
- **THEN** the app reconnects to it in the background and shows a connected/reconnecting state, not a fresh "Connect" prompt

#### Scenario: Reconnect failure is recoverable

- **WHEN** auto-reconnect to the remembered printer fails
- **THEN** the UI shows a "Reconnect" affordance rather than resetting to the never-connected empty state

### Requirement: Human error messages with Advanced diagnostics

Connection and print failures SHALL be surfaced as plain-language messages mapped to likely causes (out of range, out of labels, lid open, busy). The raw debug log SHALL be retained behind an "Advanced" disclosure with a Copy action, and SHALL NOT be the primary UI element in front of the user.

#### Scenario: Print failure shows a human message

- **WHEN** a print fails because the printer is out of labels or its lid is open
- **THEN** the UI shows a plain-language message about labels/lid, not a raw protocol error

#### Scenario: Debug log is available but demoted

- **WHEN** the user needs diagnostics
- **THEN** the raw log with a Copy action is available behind an "Advanced" disclosure and is collapsed by default

### Requirement: Connect-flow states

The printer section SHALL render distinct states for empty/disconnected, scanning (with incremental results), connected, and reconnecting, so the user always sees an accurate status and next action rather than a single opaque button.

#### Scenario: Scanning shows progress and incremental results

- **WHEN** a scan is in progress
- **THEN** the UI shows a scanning state and surfaces candidates as they are found rather than only after the full timeout
