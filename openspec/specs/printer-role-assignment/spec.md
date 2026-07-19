# printer-role-assignment Specification

## Purpose
TBD - created by archiving change multi-printer-roles. Update Purpose after archive.
## Requirements
### Requirement: Per-printer role

Each connected printer SHALL have a role describing which label kinds it is allowed
to print: item labels only, box labels only, or any (both). The role SHALL be
persisted keyed by the printer's device id and SHALL be restored when the printer
reconnects.

#### Scenario: Assigned role persists across reconnect

- **WHEN** a printer is assigned the "Box labels" role and later reconnects
- **THEN** it comes back with the "Box labels" role rather than resetting to a default

### Requirement: Sensible defaults for one printer

A newly connected printer SHALL default to the role "Any" so that, when it is the
only printer, it prints both item and box labels with no configuration. The role
control SHALL only need attention once a second printer is connected.

#### Scenario: Lone printer prints everything without configuration

- **WHEN** exactly one printer is connected and the user has never opened the role control
- **THEN** that printer prints both item labels and box labels

### Requirement: Role assignment UI per connected printer

The printer settings SHALL list each connected printer with its detected model and
provide a control to set that printer's role (Item labels / Box labels / Any). The
list SHALL provide an action to connect an additional printer.

#### Scenario: Two printers assigned distinct roles

- **WHEN** a B1 and a D11 are connected and the user sets the B1 to "Box labels" and the D11 to "Item labels"
- **THEN** each printer shows its assigned role and the assignments are saved

### Requirement: Coverage guidance

The settings SHALL show a plain-language hint whenever the current role assignments
leave a label kind with no printer, or assign two printers to overlapping roles
such that routing is ambiguous — for example, "No printer is set to print item
labels". The hint SHALL NOT block the user from saving the assignment.

#### Scenario: Uncovered kind is flagged

- **WHEN** both connected printers are assigned "Box labels" so no printer covers item labels
- **THEN** settings shows a hint that item labels have no assigned printer

#### Scenario: Overlap is flagged but allowed

- **WHEN** two connected printers are both left as "Any"
- **THEN** settings notes that jobs will go to one of them and still lets the user keep the assignment

