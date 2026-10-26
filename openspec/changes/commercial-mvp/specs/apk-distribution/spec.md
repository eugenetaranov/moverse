# apk-distribution Delta

## ADDED Requirements

### Requirement: Google Play release distribution

The app SHALL be distributed through Google Play: release builds signed with a proper upload keystore (Play App Signing enrolled), an app listing with the privacy-policy URL and completed data-safety form, and compliance with Play's current target API level. Releases SHALL flow through a closed-testing track first (satisfying the new-account requirement of 12+ testers over 14 days, using beta companies' crews) and then production. CI SHALL build the signed AAB; keystore secrets SHALL live in CI secrets, never in the repo.

#### Scenario: Closed testing before production

- **WHEN** the first commercial build is ready
- **THEN** it is released to the closed-testing track, beta crews install it from Play, and production release is only possible after the testing requirement is met

#### Scenario: Signed release build in CI

- **WHEN** a release is triggered in CI
- **THEN** an AAB signed with the upload keystore (from CI secrets) is produced and uploadable to the Play Console

#### Scenario: Listing meets Play data requirements

- **WHEN** the Play listing is submitted
- **THEN** it includes the privacy-policy URL and a data-safety form covering photos, account data, and AI processing, and the app includes in-app account deletion

## MODIFIED Requirements

### Requirement: Installable on-device build pointing at production

The published build SHALL install on an Android phone (via Google Play for testers/customers; the sideloadable CI APK remains for development) without a developer computer, and SHALL target the production backend. A fresh install SHALL support the full first-run path: sign in or sign up, then complete one capture that persists to the production backend.

#### Scenario: Install from Play and save an item

- **WHEN** a tester installs the app from the Play closed track, signs in, and completes one capture (scan or mint `ITM-*` → photo → description → box → Save)
- **THEN** the item is persisted to the production backend and appears in Browse and on the job's client report

#### Scenario: Install from the link and save an item

- **WHEN** a developer opens the CI release link on the phone, installs the sideload APK, signs in, and completes one capture
- **THEN** the app runs against its configured backend and the item persists there
