# Spec Delta

## Purpose

Defines the curated, phased moving-checklist content that the public page, the email reminders, the in-app checklist and company client checklists are all built from.

## ADDED Requirements

### Requirement: Phased template structure

A checklist template SHALL have a stable key, a version, a title, and an ordered list of tasks. Each task SHALL have:
- a stable task key;
- a title;
- an optional note;
- exactly one phase, from: `8_weeks`, `4_weeks`, `moving_week`, `moving_day`, `after`;
- a due offset in whole days relative to the move date (negative = before);
- an optional action link.

Phases SHALL always be shown in the order listed above.

#### Scenario: Tasks group by phase

- **WHEN** a template is displayed anywhere
- **THEN** its tasks appear grouped under the five phases in fixed order, keeping the template's task order within each phase

### Requirement: Default template available at launch

The system SHALL ship one general moving template (`general`) with tasks in every phase. It SHALL include packing tasks that carry action links to Moverse capture and browse, at least "Label and photograph every box" and "Check every box arrived".

#### Scenario: Default template content

- **WHEN** the `general` template is loaded
- **THEN** every phase has at least one task, and at least two tasks have action links

### Requirement: Action links target known destinations

An action link SHALL name one destination from a fixed set:

| Destination | Opens |
|---|---|
| `capture` | start packing |
| `browse_boxes` | the Boxes list |
| `browse_boxes_status:<status>` | the Boxes list filtered to that status |
| `print_labels` | label printing |

A template that references any other destination SHALL be rejected when templates are validated.

#### Scenario: Unknown destination rejected

- **WHEN** a template task's action link is `open_wallet`
- **THEN** template validation fails and names the task

### Requirement: Due dates derive from the move date

When a move date is known, each task's due date SHALL be the move date plus the task's due offset. Without a move date, tasks SHALL show their phase and no due date.

#### Scenario: Due date calculation

- **WHEN** the move date is 2027-03-20 and a task's offset is −28
- **THEN** the task's due date is 2027-02-20

#### Scenario: No move date yet

- **WHEN** no move date has been entered
- **THEN** tasks show under their phases without due dates

### Requirement: Template versions do not rewrite existing checklists

Changing a template SHALL NOT alter checklists already created from it. A job checklist SHALL record the template key and version it was created from.

#### Scenario: Template updated after a checklist exists

- **WHEN** a task is added to the `general` template after a user's checklist was created
- **THEN** that user's checklist is unchanged
