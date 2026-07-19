# item-label-reprint Specification

## Purpose
TBD - created by archiving change label-print-ergonomics. Update Purpose after archive.
## Requirements
### Requirement: Reprint an existing item's label

The app SHALL let a user reprint a label for an item that already has a code,
reusing that existing code (no new code is minted), from the item's detail view in
addition to the post-assign screen. The reprint SHALL route to the item-label
printer and use that printer's label size.

#### Scenario: Reprint from item detail

- **WHEN** the user opens a saved item that has a code and taps "Print label"
- **THEN** a label for that item's existing code is printed on the item-label printer, with no new code created

#### Scenario: Reprint reuses the current code

- **WHEN** an item is reprinted
- **THEN** the reprinted label shows the same code the item already has, not a newly generated one

### Requirement: Reprint honors no-printer recovery

When no printer covers item labels, reprinting SHALL surface the same kind-aware
recovery as first-time item printing (connect/assign a printer, or write by hand)
rather than failing silently.

#### Scenario: Reprint with no item printer

- **WHEN** the user reprints an item label but no connected printer is set for item labels
- **THEN** the kind-aware recovery is shown (connect/assign a printer, or write by hand)

