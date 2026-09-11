# job-management Delta

## ADDED Requirements

### Requirement: Jobs under an organization

The system SHALL model jobs (one client move) under an org: name, optional client name, status `active` or `archived`, and per-job item/box code sequences. All boxes and items SHALL belong to exactly one job. Archiving a job SHALL keep its data readable (and its client report working) but exclude it from packing and from active-job billing counts.

#### Scenario: Create a job

- **WHEN** an admin creates a job "Smith family — March 14"
- **THEN** the job appears in the org's job list as active, with empty inventory and fresh code sequences starting at `BOX-01` / `ITM-0001`

#### Scenario: Archive a job

- **WHEN** an admin archives a completed job
- **THEN** the job leaves the active list and the billing active-job count, packing into it is no longer possible, and its inventory and report remain viewable

#### Scenario: Codes are independent between jobs

- **WHEN** two jobs each pack their first box
- **THEN** both boxes are `BOX-01`, each within its own job, with no collision

### Requirement: Job switcher for company users

For members of a company org with more than zero jobs, the mobile app SHALL show the current job context and provide a job switcher (owners/admins see all org jobs; crew see only their invited jobs). Pack and Browse SHALL always operate on the selected job. The selected job SHALL persist across app restarts.

#### Scenario: Admin switches jobs

- **WHEN** an admin switches from job A to job B in the switcher
- **THEN** Pack captures into job B and Browse lists job B's boxes and items

#### Scenario: Crew has no switcher beyond their jobs

- **WHEN** a crew member invited to one job opens the app
- **THEN** they are locked to that job's pack mode with no switcher to other jobs

#### Scenario: Personal users never see the switcher

- **WHEN** a personal-org user (single auto-created job) uses the app
- **THEN** no job switcher or job name chrome is displayed anywhere
