# job-management Delta

## ADDED Requirements

### Requirement: Jobs under an organization

The system SHALL model jobs (one client move) under an org with a name, an optional client name, a status of `active` or `archived`, and per-job item and box code sequences. Owners and admins SHALL be able to create, rename, archive and unarchive jobs. Archived jobs SHALL remain readable but SHALL reject new captures, code reservations and invites.

#### Scenario: Create a job

- **WHEN** an admin creates the job "Smith — Mar 14"
- **THEN** it is active, has no inventory, and its first codes will be `BOX-01` and `ITM-0001`

#### Scenario: Capture into an archived job is refused

- **WHEN** a client saves an item into an archived job
- **THEN** the API rejects it with `job_archived` and nothing is written

#### Scenario: Codes are independent between jobs

- **WHEN** two jobs each create their first box
- **THEN** both are `BOX-01` with no collision

### Requirement: Current job context

Every inventory API call SHALL be made in the context of one job, sent in the `X-Moverse-Job` header and checked server-side against the caller's access. The app SHALL keep a current org and job per user, persisted across restarts. It SHALL show no org or job UI to a personal user with a single active job, show the job and a switcher to company owners and admins, and show a locked job header to crew (with switching only among assigned jobs). Browse, Pack and code pools SHALL always operate on the current job.

#### Scenario: Missing or foreign job header

- **WHEN** an inventory request has no job header, or names a job the caller cannot access
- **THEN** the API responds 400 or 404 respectively and returns no data

#### Scenario: Admin switches jobs

- **WHEN** an admin switches from job A to job B
- **THEN** Pack saves into B, Browse lists B, and reserved codes come from B's pool

#### Scenario: Personal user sees no job UI

- **WHEN** a personal user with one active job uses the app
- **THEN** no job name, switcher or org UI appears
