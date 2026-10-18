# api-security Delta

## ADDED Requirements

### Requirement: Every endpoint requires a verified user token

Every API endpoint except cron routes SHALL require `Authorization: Bearer <Supabase access token>`. The API SHALL verify the token's signature, audience, issuer and expiry locally, supporting both asymmetric (JWKS) and shared-secret signing so the same code runs against Supabase Cloud and self-hosted Supabase. The shared `x-app-secret` mechanism SHALL be removed and the leaked secret rotated. Cron routes SHALL require the platform cron secret.

#### Scenario: Missing or invalid token

- **WHEN** a request has no token, an expired token, or a token signed by another project
- **THEN** the API responds 401 `unauthenticated` and performs no data access

#### Scenario: Legacy shared-secret client

- **WHEN** a request carries only the retired `x-app-secret` header
- **THEN** it is rejected as unauthenticated

### Requirement: Database access runs as the calling user

The API SHALL run all ordinary data access with the caller's token, so database row-level security applies to every query. Service-role credentials SHALL be usable only from one privileged module limited to account deletion, storage cleanup and migration scripts, and enforced by a lint rule. Multi-step privileged operations (provisioning, invite consumption, member management, quota) SHALL be database functions that check the caller's identity themselves.

#### Scenario: Handler bug cannot cross tenants

- **WHEN** a handler issues a query that forgets its job filter
- **THEN** row-level security still limits results to rows the caller may access

#### Scenario: Service role import is blocked

- **WHEN** code outside the allowed files imports the privileged module
- **THEN** lint fails in CI

### Requirement: Row-level security enforces roles and tenancy

Row-level security SHALL be enabled on every tenant table, with separate policies per command that implement the permission matrix. Plan, billing, sequence, token and usage columns SHALL NOT be writable by members. Cross-job links between items, boxes and photos SHALL be impossible by foreign-key constraints. Photo storage keys SHALL be generated server-side under the owning org and job prefix. Functions SHALL NOT be executable by the anonymous database role, and SHALL pin their `search_path`. An automated test suite SHALL cover every role × table × command combination plus known escalation attempts, and SHALL run in CI as a merge requirement.

#### Scenario: Cross-org read via direct database access

- **WHEN** a member of org A queries org B's tables directly with their own token
- **THEN** zero rows are returned

#### Scenario: Cross-job link is rejected

- **WHEN** any caller tries to link an item in job J1 to a box in job J2
- **THEN** the database rejects it with a constraint violation

#### Scenario: Escalation tests gate merges

- **WHEN** a migration change lets crew update `memberships.role`
- **THEN** the CI test suite fails and the change cannot merge

### Requirement: Describe quota and payload cap

`/describe` SHALL reject bodies over 1.5 MB before reading them, and SHALL count each call against a per-org daily quota using an atomic increment, with limits set by plan. Over quota, it SHALL return 429 `quota_exceeded` and the app SHALL continue with manual description entry.

#### Scenario: Quota exhausted

- **WHEN** an org has used its daily describe quota and a member captures another item
- **THEN** `/describe` returns `quota_exceeded`, the app shows the manual description field, and saving still works

#### Scenario: Concurrent calls do not overrun the quota

- **WHEN** two crew phones call `/describe` at the same moment with one call left
- **THEN** exactly one succeeds

### Requirement: Rate limits on public-facing auth surfaces

Sign-in, one-time-code, sign-up and anonymous sign-in SHALL be rate-limited per IP by the auth service. `/invites/consume` and `/account/provision` SHALL be rate-limited per IP at the edge. All API routes SHALL have a per-IP ceiling.

#### Scenario: Invite token guessing is throttled

- **WHEN** one IP submits many invalid invite tokens in a minute
- **THEN** further requests from that IP are throttled
