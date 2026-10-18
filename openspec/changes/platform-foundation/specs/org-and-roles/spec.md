# org-and-roles Delta

## ADDED Requirements

### Requirement: Organizations, memberships and job assignments

The system SHALL model orgs (kind `personal` or `company`), memberships linking a user to an org with exactly one role (`owner`, `admin` or `crew`), and job assignments linking crew members to the specific jobs they may access. Each org SHALL have exactly one owner. A user MAY belong to several orgs. Owners and admins SHALL access all jobs in their org; crew SHALL access only jobs they are assigned to.

#### Scenario: Crew is limited to assigned jobs

- **WHEN** a crew member assigned to job J1 requests data for job J2 in the same org
- **THEN** the request fails as not found and no J2 data is returned

#### Scenario: Admin sees all org jobs

- **WHEN** an admin lists jobs
- **THEN** every job in the org is returned, active and archived

#### Scenario: Crew assigned to a second job

- **WHEN** an admin assigns an existing crew member to job J2
- **THEN** that crew member can access J1 and J2 without a new invite

### Requirement: Role permissions enforced server-side

The system SHALL enforce the permission matrix in design D3 in the API and in database row-level security. In summary:

- Crew SHALL capture, edit and change box status within assigned jobs. Crew SHALL NOT delete inventory, create jobs, manage invites or members, read report tokens, or read billing.
- Admins SHALL do everything crew can in all jobs, plus create and archive jobs, manage crew invites, assign and remove crew, and manage report links.
- Owners SHALL additionally manage admins, transfer ownership, rename and delete the org, and read billing state.

Plan and billing fields SHALL be writable only by privileged server paths, never by any member.

#### Scenario: Crew cannot escalate

- **WHEN** a crew member attempts, by any API call or direct database request with their token, to change their role, set the org plan, reset usage counters or read invite tokens
- **THEN** the operation is rejected and nothing changes

#### Scenario: Crew cannot delete inventory

- **WHEN** a crew member calls item or box delete
- **THEN** the API responds 403 and the records remain

#### Scenario: Admin cannot manage admins

- **WHEN** an admin tries to promote a crew member to admin or remove another admin
- **THEN** the request is rejected; only the owner may do this

### Requirement: Crew invites

Owners and admins of a company org SHALL be able to create an invite scoped to one job with role `crew`, an expiry (default 7 days) and a use limit (default 20). The system SHALL store only a hash of the invite token and SHALL return the token once at creation. The invite SHALL be presentable as a QR code and a link `https://<domain>/j/<token>` that opens the app. Consuming a valid invite SHALL atomically create or keep the org membership (never downgrading an existing higher role), add the job assignment and count a use, then take the user into that job's Pack screen. Invites SHALL be revocable. Personal orgs SHALL NOT create invites.

#### Scenario: Crew joins by scanning the foreman's QR

- **WHEN** a new crew member scans the invite QR on an admin's phone and enters a display name
- **THEN** they get an account, a `crew` membership and an assignment to that job, and land in Pack for that job

#### Scenario: Expired, revoked or used-up invite

- **WHEN** someone opens an invite that is past its expiry, revoked, or at its use limit
- **THEN** joining is refused with a clear message and no membership or assignment is created

#### Scenario: Existing admin consumes a crew invite

- **WHEN** a user who is already an admin of the org consumes a crew invite for job J
- **THEN** their role stays admin

#### Scenario: Tokens are not readable after creation

- **WHEN** an admin lists the job's invites
- **THEN** each invite's expiry, uses and creator are shown, but no token

### Requirement: Member and ownership management

Owners and admins SHALL see the org's members with roles and job assignments. Admins SHALL be able to remove crew and change crew job assignments. Owners SHALL be able to change any member's role, remove admins, and transfer ownership to another member (the previous owner becomes admin). Removal SHALL revoke access on the member's next request. Members other than the sole owner SHALL be able to leave an org.

#### Scenario: Removed crew loses access immediately

- **WHEN** an admin removes a crew member while that crew member's app is open
- **THEN** the crew member's next API call fails as unauthorized for that org, and the app returns them to their remaining orgs or to sign-in

#### Scenario: Ownership transfer

- **WHEN** the owner transfers ownership to admin A
- **THEN** A becomes the owner, the previous owner becomes admin, and the org still has exactly one owner

#### Scenario: Sole owner cannot leave

- **WHEN** the only owner tries to leave the org
- **THEN** the request is rejected with a prompt to transfer ownership or delete the org
