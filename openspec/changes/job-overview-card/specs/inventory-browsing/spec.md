# Spec Delta

## ADDED Requirements

### Requirement: Filter boxes by lifecycle status

The Boxes list SHALL support filtering by one box lifecycle status (`packing`, `sealed`, `loaded` or `delivered`). An active filter SHALL be shown as a visible chip that clears the filter when dismissed. Search SHALL apply within the filtered set. Each box card SHALL show the box's current status.

#### Scenario: Filter combined with search

- **WHEN** the Boxes list is filtered to `sealed` and the user searches "kitchen"
- **THEN** only sealed boxes whose code or name matches "kitchen" are shown

#### Scenario: Clearing the filter

- **WHEN** the user dismisses the status chip
- **THEN** the Boxes list shows all boxes again, with the search still applied

### Requirement: Filter items by attention state

The Items list SHALL support two attention filters: items linked to no box, and items with an empty description. An active filter SHALL be shown as a dismissible chip.

#### Scenario: Unboxed items

- **WHEN** the Items list is filtered to unboxed items
- **THEN** only items with no box membership are shown
