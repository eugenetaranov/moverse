## ADDED Requirements

### Requirement: Route a label kind to its printer

Printing SHALL request a printer by label kind (item or box) rather than using a
single global printer. Resolution SHALL prefer a connected printer whose role
equals the kind, then a connected printer whose role is "Any". When more than one
printer qualifies at the same tier, selection SHALL be deterministic (stable across
identical jobs), never arbitrary.

#### Scenario: Box job goes to the box printer

- **WHEN** a B1 is assigned "Box labels", a D11 is assigned "Item labels", and the user prints a box label
- **THEN** the box label is sent to the B1

#### Scenario: Item job goes to the item printer

- **WHEN** the same two printers are connected and the user prints an item label
- **THEN** the item label is sent to the D11

#### Scenario: Exact role beats Any

- **WHEN** one connected printer is assigned "Item labels" and another is "Any", and an item label is printed
- **THEN** it is sent to the "Item labels" printer, not the "Any" printer

#### Scenario: Deterministic choice among equals

- **WHEN** two connected printers both qualify for a kind at the same tier
- **THEN** repeated prints of that kind consistently go to the same printer rather than switching arbitrarily

### Requirement: Render for the routed printer

The label raster and the QR-vs-text-only choice SHALL be produced for the routed
printer's model width and configured label size, so a small-format printer prints a
narrow item label and a large-format printer prints a full box label without a
manual size switch between jobs.

#### Scenario: Item label rasters for the small printer

- **WHEN** an item label routes to a small-format printer (e.g. D11)
- **THEN** the raster is generated at that printer's head width rather than the large printer's width

### Requirement: Missing-printer-for-kind recovery

When no connected printer covers the requested label kind, the app SHALL NOT print
a wrong-size label or dead-end the flow. It SHALL surface a kind-specific message
and offer recovery: connect or assign a printer for that kind, print on another
connected printer anyway, or write the label by hand.

#### Scenario: No item printer connected

- **WHEN** the user prints an item label but no connected printer is assigned "Item labels" or "Any"
- **THEN** a message explains no printer is set for item labels and offers to connect/assign one, use another connected printer, or write by hand

#### Scenario: No printers at all

- **WHEN** no printer is connected and the user reaches a print step
- **THEN** the flow falls back to writing the label by hand, as before
