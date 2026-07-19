## ADDED Requirements

### Requirement: Build a sideloadable APK in CI

The project SHALL build a debug-signed, sideloadable Android APK in GitHub Actions from the
Expo app in `mobile/`, triggered by a push to `main` touching `mobile/**` or the workflow file,
and by manual `workflow_dispatch`. The build SHALL be self-contained (no signing secrets and no
committed native project — `expo prebuild` regenerates `android/`).

#### Scenario: Push to main builds an APK

- **WHEN** a commit is pushed to `main` changing files under `mobile/`
- **THEN** the `Android APK` workflow runs `expo prebuild` and Gradle `assembleRelease` and
  produces `app-release.apk`

#### Scenario: Manual run

- **WHEN** a user clicks **Run workflow** on the `Android APK` workflow
- **THEN** the same build runs and produces an APK

### Requirement: Publish the APK to a GitHub Release with a stable URL

On a successful build the workflow SHALL publish the APK to a GitHub Release under the rolling
pre-release tag `android-latest`, replacing the previous asset, so that the download URL is
permanent. The Release SHALL be marked pre-release and SHALL NOT be marked the repository's
latest release. The asset SHALL be named `moverse.apk` and the Release SHALL record the commit
SHA and app version.

#### Scenario: Successful build publishes a downloadable APK

- **WHEN** a build completes successfully
- **THEN** the `android-latest` Release exists with a `moverse.apk` asset downloadable at
  `https://github.com/eugenetaranov/moverse/releases/download/android-latest/moverse.apk`

#### Scenario: A later build replaces the asset at the same URL

- **WHEN** a subsequent build completes
- **THEN** the `android-latest` Release's `moverse.apk` is replaced with the new build while the
  download URL stays the same

#### Scenario: Release does not hijack "Latest release"

- **WHEN** the `android-latest` Release is published
- **THEN** it is flagged as a pre-release and is not shown as the repository's latest release

### Requirement: Installable on-device build pointing at production

The published APK SHALL install on an Android phone via the browser download link (with
"install unknown apps" allowed) without a developer computer, and SHALL target the production
backend `https://moverse-chi.vercel.app`.

#### Scenario: Install from the link and save an item

- **WHEN** the user opens the release link on the phone, installs the APK, and completes one
  capture (scan `ITM-*` → photo → description → scan `BOX-*` → Save)
- **THEN** the app POSTs to `https://moverse-chi.vercel.app/save` and a new Item appears in
  Airtable
