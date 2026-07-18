## Why

The Android app already builds successfully in CI — `.github/workflows/android.yml` runs
`expo prebuild` → Gradle `assembleRelease` (debug-keystore signed, fine for personal
sideloading) and uploads the APK. But it uploads it as a **workflow artifact**: a zip that
requires a GitHub login on a computer, an unzip, and a manual transfer to the phone. That is
too clunky for the actual need — grabbing the latest build onto the test phone in seconds.

We want a **direct, phone-openable `.apk` URL**: open it in the phone's browser, tap, install.

## What Changes

- The existing `Android APK` workflow keeps building on **push to `main` (`mobile/**`) and
  manual `workflow_dispatch`**, but now also **publishes each successful build to a GitHub
  Release**.
- The Release uses a **rolling pre-release tag `android-latest`** — the same tag every build,
  with the APK asset replaced — so the download URL is permanent:
  `https://github.com/eugenetaranov/moverse/releases/download/android-latest/moverse.apk`.
- The APK is renamed to a stable `moverse.apk`; the Release name/body carry the commit SHA and
  `app.json` version for traceability. `prerelease: true` / `make_latest: false` so it does not
  hijack the repo's "Latest release" designation.
- The workflow artifact upload is kept as a fallback.
- `SETUP.md` / `README.md` document the install-from-link flow (enable "install unknown apps"
  for the browser, tap the APK). The app targets the production backend
  `https://moverse-chi.vercel.app`.

## Capabilities

### New Capabilities
- `apk-distribution`: CI builds a sideloadable Android APK on push-to-main/manual and publishes
  it to a GitHub Release with a stable, phone-installable download URL.

### Modified Capabilities
<!-- Supersedes the delivery assumption in the moverse-mvp change: task 5.4 there framed the
standalone APK as `eas build -p android`. The implemented and supported path is GitHub Actions
+ GitHub Release; EAS is not used. -->

## Impact

- **CI**: `.github/workflows/android.yml` gains `permissions: contents: write`, an APK-rename
  step, and a `softprops/action-gh-release@v2` publish step. No change to how the APK is built.
- **Signing**: debug keystore only — sufficient for personal sideloading; no keystore secrets,
  no Play Store upload key. Production signing is out of scope.
- **Docs**: `SETUP.md` §5 and `README.md` describe the Release-link install flow.
- **No new services/accounts/cost**: stays entirely on GitHub Actions + GitHub Releases.
