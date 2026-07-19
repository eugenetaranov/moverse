## ADDED Requirements

### Requirement: Print a box label from the box's detail screen

The app SHALL let the user print a label for a box from that box's detail screen,
using the box's existing code (no new code is minted). The label SHALL be routed to
the printer assigned box labels and rendered at that printer's label size and
printhead width, using the configured box-QR content and saved extra text.

#### Scenario: Print a box's label on demand

- **WHEN** the user opens a box and taps "Print label"
- **THEN** a label for that box's code is printed on the box-label printer, showing the code (and QR/extra text per settings), with no new code created

#### Scenario: Named box prints its code

- **WHEN** the box has a free-typed name rather than a `BOX-####` code and its label is printed
- **THEN** the label shows that name/code and encodes it, the same as any other box

### Requirement: Print one or more copies

The user SHALL be able to choose how many copies to print (default one) and print
that many identical box labels in a single action. Copies SHALL be limited to a
reasonable maximum. Progress SHALL be shown across copies, and the user SHALL be able
to cancel between copies, with an honest report of how many printed.

#### Scenario: Print multiple copies

- **WHEN** the user sets the copies count to 3 and prints
- **THEN** three identical labels for the box are printed, with progress shown (e.g. "Printing 2 of 3")

#### Scenario: Default is a single copy

- **WHEN** the user prints without changing the copies count
- **THEN** exactly one label is printed

#### Scenario: Cancel between copies

- **WHEN** the user cancels after the second of five copies has printed
- **THEN** printing stops, two labels have printed, and the result reports two of five

### Requirement: No-printer recovery for box printing

When no connected printer is assigned box labels, box-label printing SHALL NOT fail
silently. It SHALL surface the same recovery as item printing: connect/assign a box
printer, or write the code by hand.

#### Scenario: No box printer connected

- **WHEN** the user prints a box label but no connected printer is set for box labels
- **THEN** a recovery prompt is shown (connect/assign a printer, or write the code by hand) rather than a silent failure

### Requirement: One shared box-label print path

Box-label printing from the detail screen and from the packing (set-box) flow SHALL
use one shared print path, so routing, rendering, QR content, copies, and recovery
behave identically in both places.

#### Scenario: Packing and detail print the same label

- **WHEN** the same box is printed from the packing flow and later from its detail screen
- **THEN** both produce the same label content, at the box printer's size, via the same routing and recovery
