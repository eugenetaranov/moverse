# Spec Delta

## Purpose

Lets visitors to the public checklist opt in to receive the checklist and reminders timed to their move date by email, with consent recorded and unsubscribing always possible.

## ADDED Requirements

### Requirement: Double opt-in sign-up

The public checklist SHALL offer an email sign-up that takes an email address and an optional move date. Submitting it SHALL send a confirmation email. No other email SHALL be sent until the visitor confirms through the link in it. Unconfirmed sign-ups SHALL be deleted after 7 days.

#### Scenario: Confirm before reminders

- **WHEN** a visitor signs up and does not click the confirmation link
- **THEN** they receive no checklist or reminder emails, and their record is deleted after 7 days

#### Scenario: Confirmation

- **WHEN** the visitor clicks the confirmation link
- **THEN** they are subscribed and receive the checklist email

### Requirement: Consent record

For each subscriber the system SHALL store:
- the email address;
- the move date, if given;
- when and where consent was given (page and wording version);
- the confirmation time;
- the unsubscribe time, if any.

The sign-up form SHALL state what will be sent and link to the privacy policy.

#### Scenario: Consent stored

- **WHEN** a sign-up is confirmed
- **THEN** the record holds the sign-up time, the form's page, the wording version and the confirmation time

### Requirement: Reminder schedule

Confirmed subscribers who have a move date SHALL receive at most these emails:
- the checklist on confirmation;
- one reminder at the start of each of the `4_weeks` and `moving_week` phases;
- one after the move.

Each reminder SHALL list that phase's tasks. Reminders whose send date has already passed at sign-up SHALL be skipped. Subscribers without a move date SHALL receive only the checklist email.

#### Scenario: Late sign-up

- **WHEN** someone confirms ten days before their move
- **THEN** they get the checklist email, the moving-week reminder and the after-move email, but not the 4-weeks reminder

### Requirement: One-click unsubscribe

Every email SHALL contain an unsubscribe link and the matching list-unsubscribe headers that support one-click unsubscribe. Unsubscribing SHALL stop all further emails immediately and SHALL NOT require signing in.

#### Scenario: Unsubscribe

- **WHEN** a subscriber clicks unsubscribe
- **THEN** a confirmation page is shown and no further emails are sent

### Requirement: Abuse limits on sign-up

The sign-up endpoint SHALL be rate-limited per IP. It SHALL reject malformed addresses. It SHALL NOT reveal whether an address is already subscribed. Re-submitting an already confirmed address SHALL NOT send another confirmation email.

#### Scenario: Repeated submissions

- **WHEN** the same IP submits the form 20 times in a minute
- **THEN** submissions beyond the limit are refused, and no extra emails are sent
