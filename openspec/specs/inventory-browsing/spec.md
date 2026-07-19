# inventory-browsing Specification

## Purpose
TBD - created by archiving change browse-inventory. Update Purpose after archive.
## Requirements
### Requirement: Browse home with segmented boxes/items and search

The browse home SHALL provide a sticky search field and a segmented control to switch between a **Boxes** list and an **Items** list. On entering Browse, the app SHALL load inventory from the backend read endpoints and support pull-to-refresh to reload it. Lists SHALL be virtualized.

#### Scenario: Default view lists boxes

- **WHEN** the user opens the Browse tab
- **THEN** inventory is loaded and the Boxes segment is shown by default

#### Scenario: Switch to the items segment

- **WHEN** the user selects the Items segment
- **THEN** the list shows all items across all boxes

#### Scenario: Pull to refresh reloads inventory

- **WHEN** the user pulls down to refresh
- **THEN** boxes and items are re-fetched from the backend and the visible list updates

### Requirement: List of boxes

The Boxes list SHALL render each box as a card showing its box code, name/notes, type (suitcase vs shipping box), destination, and the count of items in it. Tapping a box card SHALL open that box's contents.

#### Scenario: Box card shows summary

- **WHEN** the Boxes list renders a box with 7 linked items
- **THEN** its card shows the box code, name, type, destination, and an item count of 7

#### Scenario: Open a box's contents

- **WHEN** the user taps a box card
- **THEN** the box-contents screen for that box opens

#### Scenario: No boxes yet

- **WHEN** the inventory contains no boxes
- **THEN** the list shows an empty state with a helpful message rather than a blank screen

### Requirement: Box contents view

The box-contents screen SHALL show the box's identity (code, name, type, destination) and a photo grid of the items in that box, each item leading with its photo and showing its item code and description. Tapping an item SHALL open its detail.

#### Scenario: Items in a box are shown as photo cards

- **WHEN** the user opens a box containing items
- **THEN** each item appears as a card leading with its photo, its item code, and a one-line description

#### Scenario: Empty box

- **WHEN** a box has no linked items
- **THEN** the screen shows an empty state indicating the box is empty

### Requirement: List of all items with box membership

The Items list SHALL render every item as a photo card showing its photo, item code, and which box(es) it belongs to. An item linked to more than one box SHALL show all its box memberships.

#### Scenario: Item shows its box

- **WHEN** the Items list renders an item linked to BOX-0003
- **THEN** its card shows the item photo, item code, and a "BOX-0003" box chip

#### Scenario: Item in multiple boxes

- **WHEN** an item is linked to two boxes
- **THEN** its card shows a chip for each box it is in

### Requirement: Search items by code or description

The browse home SHALL let the user search items by item code or by description. Matching SHALL be case-insensitive substring matching against both fields, debounced as the user types, with results shown as item cards (each showing its box membership). Each matched item SHALL appear once regardless of how many boxes it is in.

#### Scenario: Match by description

- **WHEN** the user types "coat" and an item's description is "Blue winter coat"
- **THEN** that item appears in the results

#### Scenario: Match by code

- **WHEN** the user types "0042" and an item's code is "ITM-0042"
- **THEN** that item appears in the results

#### Scenario: No matches

- **WHEN** the query matches no item's code or description
- **THEN** a "no results" message referencing the query is shown, not a blank screen

#### Scenario: Clearing the query

- **WHEN** the user clears the search field
- **THEN** the current segment's full list (Boxes or Items) is shown again

### Requirement: Item detail with light edits

The item-detail screen SHALL show the item's photo, item code, editable description, destination (from its box), and its box membership. It SHALL let the user edit the description and save it, and add or move the item to another box by scanning a `BOX-` label (reusing the label scanner), persisting changes via the backend. Successful edits SHALL be confirmed with visible feedback.

#### Scenario: Edit and save a description

- **WHEN** the user edits the description and saves
- **THEN** the new description is persisted and shown, with a visible success confirmation

#### Scenario: Add the item to another box

- **WHEN** the user scans a valid `BOX-` label from the item detail
- **THEN** the item is linked to that box in addition to its current box(es) and the new box chip appears

#### Scenario: Reject a wrong-prefix scan

- **WHEN** the user scans an `ITM-` code where a box is expected
- **THEN** the scan is rejected with a clear message and no change is made

### Requirement: Box detail with metadata edits

The box-detail (or box-contents header) SHALL let the user edit the box's name/notes, type, and destination, persisting changes to the backend. Changing a box's destination SHALL be reflected in the looked-up destination of items in that box.

#### Scenario: Edit box name

- **WHEN** the user edits a box's name/notes and saves
- **THEN** the new value is persisted and shown on the box card and header

### Requirement: Loading, empty, and error states

Browse screens SHALL show a skeleton or progress indicator while loading exceeds a short threshold, a helpful empty state when there is no content, and an error state with a retry action when a backend read fails. Photo cards SHALL reserve space for the image to avoid layout shift and SHALL carry an accessibility label describing the item.

#### Scenario: Loading indicator

- **WHEN** inventory is still loading after a short delay
- **THEN** a skeleton or progress indicator is shown instead of a blank screen

#### Scenario: Read failure is recoverable

- **WHEN** a backend read fails
- **THEN** an error message with a retry action is shown, and retrying re-attempts the load

#### Scenario: Photo card is labeled for accessibility

- **WHEN** a photo card renders
- **THEN** it exposes an accessibility label including the item code and description

