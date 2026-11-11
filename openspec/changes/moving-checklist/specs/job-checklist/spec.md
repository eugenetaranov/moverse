# Spec Delta

## Purpose

A per-job moving checklist created from a template. Personal users use it in the app to plan their move. Company client checklists are built on the same per-job copy. It stays tied to the job's move date and to Moverse's capture and browse screens.

## ADDED Requirements

### Requirement: Optional move date on a job

A job SHALL have an optional move date, which owners and admins can set, change and clear. Personal users SHALL be able to set their job's move date from the checklist. Changing the move date SHALL recompute every due date on that job's checklist.

#### Scenario: Move date postponed

- **WHEN** the move date changes from 2027-03-20 to 2027-04-03
- **THEN** every checklist task's due date moves 14 days later

### Requirement: Checklist created from a template

Each job SHALL have at most one checklist.
- For a personal job, it SHALL be created from the `general` template the first time the user opens the checklist.
- For a company job, it SHALL be created from the org's checklist template when the job is created. For jobs that already exist, it SHALL be created when the job's checklist is first opened.

The checklist SHALL record the template key and version.

#### Scenario: First open by a personal user

- **WHEN** a personal user opens the checklist for the first time
- **THEN** the checklist contains the `general` template's tasks, and the app asks for the move date (the user may skip it)

### Requirement: Checklist in the app for personal users

Personal users SHALL reach the checklist from the app's main navigation. It SHALL show:
- tasks grouped by phase;
- each task's due date and overdue state, when a move date is set;
- an overall "X of Y done" progress line.

Ticking or unticking a task SHALL save immediately and SHALL work offline, syncing later.

#### Scenario: Tick a task offline

- **WHEN** a personal user ticks a task with no signal
- **THEN** the task shows as done straight away, and the tick is saved to the server once the device reconnects

### Requirement: Custom tasks

Users who can edit a job's checklist SHALL be able to add a custom task to a phase, and edit or delete any task on that job's checklist. Custom tasks SHALL have a title, an optional note and an optional due date, and no action link.

#### Scenario: Add a custom task

- **WHEN** a personal user adds "Book the parking permit" to the 4-weeks phase
- **THEN** the task appears in that phase, and stays there after a refresh on another device

### Requirement: Action links open Moverse screens

A task with an action link SHALL show a button that opens the linked destination for the current job, for example the capture flow or the Boxes list filtered to `delivered`.

#### Scenario: Pack the kitchen

- **WHEN** the user taps the action button on a task linked to `capture`
- **THEN** the capture flow opens for the current job

### Requirement: No purchase prompts inside the checklist

The in-app checklist SHALL contain no prices, purchase buttons or links to checkout. When a plan limit stops an action link from completing, the app SHALL show the neutral limit message used elsewhere in the app.

#### Scenario: Free limit reached from a task

- **WHEN** a free user at their item limit taps a capture action link
- **THEN** the neutral limit message is shown, with no price and no link

### Requirement: Who can see and edit a job checklist

- Owners and admins SHALL be able to read and edit their jobs' checklists.
- Personal users SHALL be able to read and edit their own job's checklist.
- Crew SHALL NOT see job checklists.
- Every checklist read and write SHALL be checked against the caller's access to the job.

#### Scenario: Crew cannot see the checklist

- **WHEN** a crew member requests a job's checklist
- **THEN** the request is refused
