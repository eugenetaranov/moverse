## ADDED Requirements

### Requirement: Visually distinct settings sections

The Settings screen SHALL present each top-level section (labeling mode, printers,
print tuning, box labels) as a visually delimited block, with a clear visual
boundary between adjacent sections, so a user can tell at a glance where one section
ends and the next begins. Grouping SHALL NOT rely on the section heading text alone.

#### Scenario: Printer and box-label sections are visually separated

- **WHEN** the Settings screen is shown with printers and a box-labels section
- **THEN** there is a clear visual boundary (surface/card grouping, spacing, and/or a divider) between the printers section and the box-labels section, not just a text header

#### Scenario: Each section reads as its own block

- **WHEN** the user scrolls through Settings
- **THEN** each section's controls are visually grouped together and separated from the next section's controls

### Requirement: Per-printer diagnostics log

Each connected printer's card SHALL provide access to a diagnostics log filtered to
that printer's traffic, in addition to the existing global log. Opening a printer's
log SHALL show that printer's lines.

#### Scenario: View one printer's log

- **WHEN** two printers are connected and the user opens the log from one printer's card
- **THEN** the log shows that printer's activity (filtered to its device) rather than the combined stream

#### Scenario: Global log still available

- **WHEN** the user opens the global log link
- **THEN** the combined log across all printers is shown as before
