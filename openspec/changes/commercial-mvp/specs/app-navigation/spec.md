# app-navigation Delta

## ADDED Requirements

### Requirement: Authentication gate at the root

The app SHALL show an auth flow (sign in, sign up with a "company" vs "just me" choice, invite-join) when no session exists, and the two-tab shell (Pack/Browse) only when signed in. Deep links from invite URLs SHALL route into the invite-join flow whether or not the user is already signed in.

#### Scenario: Signed-out launch

- **WHEN** the app launches with no session
- **THEN** the auth screen is shown and the tab shell is unreachable until sign-in completes

#### Scenario: Invite deep link

- **WHEN** a user opens a crew invite link on their phone
- **THEN** the app (or store page, then app) opens the invite-join flow and, on completion, lands in that job's pack mode

### Requirement: Job context in the shell

For company-org users the shell SHALL display the current job (e.g. in the shared header) with a switcher entry point on both tabs; Pack and Browse SHALL always operate on the selected job. For crew members the shell SHALL lock to the invited job and hide job management. For personal users the shell SHALL be visually identical to the pre-commercial app — no job chrome at all.

#### Scenario: Admin sees and switches job context

- **WHEN** an admin is on either tab
- **THEN** the current job name is visible and tapping it opens the job switcher

#### Scenario: Crew mode shell

- **WHEN** a crew member is signed in
- **THEN** the shell shows their job locked in the header, Pack and Browse cover only that job, and Settings hides org/team/billing management

#### Scenario: Personal shell is unchanged

- **WHEN** a personal user uses the app
- **THEN** no job name, switcher, or team UI appears anywhere in the shell
