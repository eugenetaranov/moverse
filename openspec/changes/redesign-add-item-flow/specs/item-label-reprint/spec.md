## MODIFIED Requirements

### Requirement: Reprint an existing item's label

The app SHALL let a user reprint a label for an item that already has a code,
reusing that existing code (no new code is minted), from the item's detail view and
from the Pack idle recent-items list. Reprint SHALL NOT appear on the capture
surface itself. The reprint SHALL route to the item-label printer and use that
printer's label size.

#### Scenario: Reprint from item detail

- **WHEN** the user opens a saved item that has a code and taps "Print label"
- **THEN** a label for that item's existing code is printed on the item-label printer, with no new code created

#### Scenario: Reprint from recent items

- **WHEN** the user taps the reprint action on an item in the Pack idle recent-items list
- **THEN** a label for that item's existing code is printed on the item-label printer, with no new code created

#### Scenario: Reprint reuses the current code

- **WHEN** an item is reprinted
- **THEN** the reprinted label shows the same code the item already has, not a newly generated one
