# api-security Delta

## ADDED Requirements

### Requirement: All API endpoints require user authentication

Every API endpoint except the public report route and auth endpoints SHALL require a valid Supabase JWT in the `Authorization` header. The API SHALL derive the caller's org, role, and job access server-side from the verified token and memberships — never from client-supplied org/job claims alone. The shared `x-app-secret` mechanism SHALL be removed and the leaked secret rotated out.

#### Scenario: Unauthenticated request is rejected

- **WHEN** any inventory endpoint is called without a valid JWT
- **THEN** the API responds 401 and performs no data access

#### Scenario: Cross-tenant access is impossible

- **WHEN** an authenticated member of org A requests a job, box, item, or photo belonging to org B (by id or code)
- **THEN** the API responds 403/404 and returns no org-B data — verified by an automated cross-tenant test in CI

#### Scenario: Old shared-secret clients are refused

- **WHEN** a legacy client sends only the retired `x-app-secret` header
- **THEN** the request is rejected as unauthenticated

### Requirement: Describe endpoint quotas and payload caps

`/describe` SHALL enforce a per-org daily quota (free tier lower than paid), reject request bodies over a size cap (~1.5 MB), and count usage server-side. When the quota is exhausted the endpoint SHALL fail softly so capture continues without an auto-description.

#### Scenario: Quota exhausted degrades gracefully

- **WHEN** an org exceeds its daily describe quota and captures another item
- **THEN** `/describe` returns a quota error, the app proceeds to manual description entry, and the save is unaffected

#### Scenario: Oversized payload rejected

- **WHEN** a request body exceeds the size cap
- **THEN** the API rejects it before contacting Anthropic

### Requirement: Rate limiting on public and auth surfaces

Unauthenticated surfaces (auth endpoints, invite consumption, report pages) SHALL be rate-limited per IP to blunt token guessing and abuse; authenticated endpoints SHALL have a generous per-user rate limit.

#### Scenario: Report token guessing is throttled

- **WHEN** an IP hammers report URLs with invalid tokens
- **THEN** requests from that IP are throttled and tokens remain unguessable in practice
