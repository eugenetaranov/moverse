# user-auth Delta

## ADDED Requirements

### Requirement: Email sign-up and sign-in

The system SHALL provide accounts through Supabase Auth. The mobile app SHALL offer sign-in and sign-up by email with a 6-digit one-time code entered in the app (no deep link required), and by email + password as an alternative. A successful one-time-code verification SHALL count as email confirmation. Passwords SHALL be at least 10 characters. Auth email SHALL be delivered through a configured custom SMTP provider.

#### Scenario: Sign up with an email code

- **WHEN** a new user enters their email, receives a 6-digit code and enters it in the app
- **THEN** an account is created with a confirmed email and a session is established

#### Scenario: Wrong or expired code

- **WHEN** a user enters an incorrect code or one older than 10 minutes
- **THEN** sign-in fails with a clear message, no session is created and the user can request a new code

#### Scenario: Sign in with password

- **WHEN** an existing user with a password signs in with the correct email and password
- **THEN** a session is established without an email code

### Requirement: Persistent, secure sessions

Sessions SHALL persist across app restarts and refresh automatically while the app is in the foreground. Session tokens SHALL be stored encrypted at rest on the device (key in the platform secure store). The app SHALL use the Supabase client only for authentication; all data access SHALL go through the API.

#### Scenario: Session survives restart

- **WHEN** a signed-in user force-closes and reopens the app
- **THEN** they are still signed in and no login screen is shown

#### Scenario: Expired access token is refreshed transparently

- **WHEN** an API call returns 401 because the access token expired
- **THEN** the app refreshes the session once and retries the call without user action

#### Scenario: Refresh fails

- **WHEN** the session cannot be refreshed (revoked or deleted account)
- **THEN** the app clears local tenant data and returns to the sign-in screen

### Requirement: Anonymous crew identity

The system SHALL allow anonymous sign-in only as part of joining through an invite, storing a display name on the user. An anonymous user SHALL be able to add and verify an email later, keeping the same user id and memberships. Anonymous users with no membership 24 hours after creation SHALL be deleted automatically.

#### Scenario: Crew joins without email

- **WHEN** a person without an account opens a valid invite and enters a display name
- **THEN** an anonymous account is created with that display name and the invite is consumed for it

#### Scenario: Crew upgrades to email

- **WHEN** an anonymous crew user adds an email in Settings and verifies the code
- **THEN** the account keeps its user id and all memberships, and can be signed into on another device by email

#### Scenario: Abandoned anonymous account is purged

- **WHEN** an anonymous account has had no membership for 24 hours
- **THEN** the cleanup job deletes it

### Requirement: Auth gate and sign-out

The app SHALL show the sign-in flow when there is no session and the main app otherwise. Invite links SHALL open the join flow whether or not the user is signed in. Signing out SHALL clear the session and every cache, code pool and preference stored for that user.

#### Scenario: Cold start without session

- **WHEN** the app starts with no stored session
- **THEN** the welcome / sign-in screen is shown and Pack and Browse are not reachable

#### Scenario: Sign out clears tenant data

- **WHEN** a user signs out from Settings
- **THEN** the session, cached inventory, code pools and saved job selection for that user are removed and the sign-in screen is shown
