# account-deletion Delta

## ADDED Requirements

### Requirement: User-initiated account deletion

The app SHALL let a signed-in user delete their account from Settings after typing a confirmation, backed by `POST /account/delete` (also used by the web deletion page). Deletion SHALL:

- Delete every org where the user is the sole owner and there are no other members, with all of that org's jobs, inventory, invites and usage, and queue its photos for removal.
- Remove the user's memberships and job assignments in other orgs, keeping records they created there with the creator cleared.
- Delete the auth user.

The app SHALL then clear all local data and return to the welcome screen.

#### Scenario: Personal user deletes their account

- **WHEN** a personal user confirms deletion
- **THEN** their account, personal org, job, items, boxes and photo records are deleted immediately, the photo objects are removed by the next cleanup run, and the app shows the welcome screen

#### Scenario: Crew member deletes their account

- **WHEN** a crew member deletes their account
- **THEN** their memberships are removed, and items they captured stay in the company's job with no creator

### Requirement: Sole company owner must hand over first

If the user is the sole owner of a company org that has other members, deletion SHALL be refused with `transfer_ownership_required` and the list of affected orgs, and nothing SHALL be deleted.

#### Scenario: Blocked owner

- **WHEN** the only owner of a company with two crew members requests deletion
- **THEN** the request is refused, nothing is deleted, and the app explains that ownership must be transferred or the company deleted first
