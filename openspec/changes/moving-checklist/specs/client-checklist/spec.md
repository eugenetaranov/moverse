# Spec Delta

## Purpose

Lets moving companies give each client a branded "Before your move" checklist on the client report page. Clients tick off their own tasks there, and the company can see in the app how ready each client is.

## ADDED Requirements

### Requirement: Org checklist template

Each company org SHALL have one editable checklist template, starting as a copy of `general`. Owners and admins SHALL be able to add, edit, reorder and delete tasks, and mark each task as either a **client task** or a **company task**. Personal orgs SHALL NOT have an org template.

#### Scenario: Company customises its template

- **WHEN** an admin adds the client task "Have keys ready for our crew at 8:00" to moving day
- **THEN** checklists created for later jobs include that task, marked as a client task

#### Scenario: Existing jobs unaffected

- **WHEN** the org template is edited
- **THEN** checklists already created for existing jobs do not change

### Requirement: Client checklist on the report

The client report page SHALL show a "Before your move" section with the job's **client tasks** only, grouped by phase, with due dates when the job has a move date. The section SHALL show the company's name, and its logo when the plan includes report branding. Company tasks SHALL NOT be shown to the client.

#### Scenario: Client sees only their tasks

- **WHEN** a client opens a valid report link for a job with 10 client tasks and 6 company tasks
- **THEN** the "Before your move" section shows the 10 client tasks, and no company tasks

### Requirement: Client ticks through the report link

A client SHALL be able to tick and untick **client tasks** through a valid report link, without an account. Each tick SHALL record that it was done by the client and when. The link SHALL NOT be able to change anything else: not company tasks, task text, or inventory. Tick requests SHALL be rate-limited per token and per IP.

#### Scenario: Client ticks a task

- **WHEN** the client ticks "Defrost the freezer"
- **THEN** the tick is saved, marked as done by the client with a timestamp, and is still there after a reload

#### Scenario: Company task cannot be ticked through the link

- **WHEN** a request through the report token tries to tick a company task
- **THEN** it is refused and nothing changes

#### Scenario: Revoked link

- **WHEN** the report token has been regenerated
- **THEN** ticks sent with the old token are refused

### Requirement: Company sees client readiness

In the app, owners and admins SHALL see each job's checklist with:
- client tasks and company tasks marked differently;
- who ticked each task (client or a named team member) and when;
- a client readiness line, e.g. "Client: 7 of 10 done".

Company tasks SHALL be tickable by owners and admins.

#### Scenario: Readiness before moving day

- **WHEN** the client has ticked 7 of 10 client tasks
- **THEN** the admin sees "Client: 7 of 10 done", with each ticked task attributed to the client
