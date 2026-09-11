# org-and-roles Delta

## ADDED Requirements

### Requirement: Organizations and memberships

The system SHALL model organizations (kind `company` or `personal`) with memberships linking users to orgs with a role: `owner`, `admin`, or `crew`. Every job, box, item, and photo SHALL belong to exactly one org (via its job). A user MAY belong to multiple orgs; the mobile app SHALL operate in one org context at a time.

#### Scenario: Company org with a team

- **WHEN** a company owner adds an admin and two crew members
- **THEN** the org has four memberships with the corresponding roles, and all four can access the org's jobs subject to their role

#### Scenario: Data is org-scoped

- **WHEN** a member of org A requests any inventory data
- **THEN** only records belonging to org A's jobs are ever returned

### Requirement: Role permissions

Roles SHALL be enforced server-side. `owner`: everything, including billing and org deletion. `admin`: manage jobs, team invites, inventory, reports. `crew`: capture and print within jobs they are invited to — no job creation, no team management, no billing visibility, no report-link management.

#### Scenario: Crew cannot manage the org

- **WHEN** a crew member's client attempts to create a job, invite a member, or read billing state via the API
- **THEN** the request is rejected with a permission error regardless of what the UI shows

#### Scenario: Admin manages jobs but not billing

- **WHEN** an admin creates and archives jobs
- **THEN** the operations succeed, while billing management endpoints remain owner-only

### Requirement: Crew invites via link and QR

Admins and owners SHALL be able to create an invite scoped to one job with role `crew`. The invite SHALL be a URL containing an unguessable token, presentable as a QR code on the inviter's phone, with an expiry (default 7 days) and revocable at any time. Consuming an invite SHALL create a membership for the joining user and take them directly into that job's pack mode. Joining SHALL require at most a display name — no email verification step.

#### Scenario: Crew joins by scanning the foreman's QR

- **WHEN** a crew member installs the app and scans the invite QR shown on the foreman's phone
- **THEN** they enter a display name, an account and a `crew` membership for that job are created, and they land directly in pack mode for that job

#### Scenario: Expired or revoked invite

- **WHEN** someone opens an invite link that has expired or been revoked
- **THEN** joining is refused with a clear message and no membership is created

#### Scenario: Invite is single-role and job-scoped

- **WHEN** a crew member joins via an invite for job J
- **THEN** their access is limited to job J with role `crew`; other jobs in the org are not visible to them
