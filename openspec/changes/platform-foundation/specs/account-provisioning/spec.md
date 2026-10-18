# account-provisioning Delta

## ADDED Requirements

### Requirement: Workspace provisioning after sign-up

After a non-anonymous user signs up, the system SHALL create their workspace through an idempotent provisioning call that takes an intent. For `personal`, it SHALL create a personal org with the user as owner and one active job named "My move". For `company`, it SHALL create a company org with the given name and the user as owner, with no job. Provisioning SHALL be a no-op when the user already has a membership. Anonymous users SHALL NOT be able to provision.

#### Scenario: Personal sign-up

- **WHEN** a user signs up choosing "Just me / my own move"
- **THEN** a personal org, an owner membership and one active "My move" job exist, and the app lands on Pack for that job with no org or job UI

#### Scenario: Company sign-up

- **WHEN** a user signs up choosing "Moving company" with name "Acme Movers"
- **THEN** a company org "Acme Movers" exists with the user as owner, and the app asks them to create their first job

#### Scenario: Provisioning is idempotent

- **WHEN** the provisioning call is repeated for a user who already has a membership
- **THEN** nothing new is created and the existing workspace is returned

#### Scenario: Anonymous user cannot provision

- **WHEN** an anonymous user calls provisioning
- **THEN** the request is refused and no org is created

### Requirement: Bootstrap endpoint

The API SHALL provide `GET /me` returning the user (id, email, display name, anonymous flag), their orgs with kind, role and plan, the jobs they can access, and a default org and job. If a non-anonymous user has no memberships, `/me` SHALL provision a personal workspace before responding. The app SHALL call `/me` after every sign-in and on cold start, and treat it as the source of truth for tenant state.

#### Scenario: Interrupted sign-up self-heals

- **WHEN** a user signed up but the app was killed before provisioning, and they open the app again
- **THEN** `/me` creates their personal workspace and returns it

#### Scenario: Crew sees only assigned jobs

- **WHEN** a crew member assigned to one job calls `/me`
- **THEN** the response lists that org with role `crew` and only the assigned job

### Requirement: Starting a company from a personal account

A user who has a personal org SHALL be able to create a company org, becoming its owner. Their personal org and its data SHALL be left unchanged, and the app SHALL let them switch between the two orgs.

#### Scenario: Personal user starts a company

- **WHEN** a personal user creates the company "Acme Movers" from Settings
- **THEN** they own a new company org, their personal job and items are unchanged, and an org switcher appears
