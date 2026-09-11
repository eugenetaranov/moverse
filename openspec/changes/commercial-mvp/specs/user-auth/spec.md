# user-auth Delta

## ADDED Requirements

### Requirement: Account signup and login

The system SHALL provide user accounts via Supabase Auth. The mobile app and the web app SHALL offer email + password sign-up and sign-in, plus magic-link sign-in as a passwordless alternative. Sessions SHALL persist across app restarts and refresh automatically; the user stays signed in until they sign out or the account is deleted.

#### Scenario: Sign up and land in the app

- **WHEN** a new user signs up with email and password in the mobile app
- **THEN** an account is created, a session is established, and the user lands on the Pack screen without further setup steps

#### Scenario: Session survives app restart

- **WHEN** a signed-in user force-closes and reopens the app
- **THEN** they are still signed in and no login screen is shown

#### Scenario: Sign out

- **WHEN** a signed-in user taps Sign out in Settings
- **THEN** the session is cleared, locally cached inventory for that account is cleared, and the login screen is shown

### Requirement: Personal onboarding creates an invisible workspace

On first sign-up through the personal path, the system SHALL automatically create a personal organization (kind `personal`) with the user as `owner` and a single active job (e.g. "My move"), so the app behaves exactly like a single-user app with no org or job concepts visible.

#### Scenario: Personal user sees no org/job chrome

- **WHEN** a user signs up choosing "Just me / my own move"
- **THEN** a personal org and one job are created silently, and no org, team, or job-switcher UI appears anywhere in the app

#### Scenario: Personal workspace scopes the data

- **WHEN** the personal user saves items and boxes
- **THEN** all records are stored under their auto-created org and job

### Requirement: In-app account deletion

The mobile app SHALL offer account deletion (a Google Play requirement). Deleting the account SHALL remove the user's memberships and, for a personal org where they are the sole member, the org and all its jobs, boxes, items, and photos. An owner of a company org with other members SHALL be required to transfer ownership or delete the org explicitly first.

#### Scenario: Personal account deletion removes data

- **WHEN** a personal user confirms account deletion in Settings
- **THEN** their account, org, jobs, items, boxes, and stored photos are deleted, and the app returns to the signed-out state

#### Scenario: Sole company owner cannot silently orphan the org

- **WHEN** the only owner of a company org with other members requests account deletion
- **THEN** deletion is blocked with an explanation until ownership is transferred or the org is deleted explicitly
