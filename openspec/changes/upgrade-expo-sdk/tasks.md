# Tasks

## 1. Baseline and preparation

- [ ] 1.1 Create branch `upgrade-expo-sdk` from `main` and confirm the current app builds (`cd mobile && npx expo prebuild --platform android --clean && cd android && ./gradlew assembleRelease`)
- [ ] 1.2 Record a baseline: APK size, CI build time, and an on-device smoke test (scan ITM/BOX QR, photo capture, save item, BLE print a box label and an item label). Note the results in the PR description
- [ ] 1.3 Run `npx expo-doctor` on SDK 52 and record the existing warnings, so new ones can be told apart later

## 2. New Architecture spike (on SDK 52)

- [ ] 2.1 Upgrade `react-native-ble-plx` to the newest version that supports SDK 52 and the New Architecture. Verify that `npm ci` and `tsc --noEmit` pass
- [ ] 2.2 Set `newArchEnabled: true` (via `expo-build-properties` / `app.json`), prebuild, and install on a device. Verify that the app launches and that printer discovery, connect and a test print work on a NIIMBOT printer
- [ ] 2.3 If 2.2 fails, evaluate a maintained fork or alternative BLE library behind `src/niimbot/transport.ts` and pick one. Verify by a successful test print before continuing

## 3. Step-by-step SDK upgrades

Each step: `npx expo install expo@^<N>` → `npx expo install --fix` → apply that SDK's changelog breaking changes and codemods → `npx expo-doctor` clean (no new warnings) → `npx tsc --noEmit` passes → `assembleRelease` succeeds → app launches and scans a QR → commit.

- [ ] 3.1 SDK 52 → 53 (verify with the per-step checks above)
- [ ] 3.2 SDK 53 → 54 (verify with the per-step checks; check the `expo-file-system` API changes)
- [ ] 3.3 SDK 54 → 55 (verify with the per-step checks; New Architecture is mandatory from here, so confirm no `newArchEnabled=false` remains)
- [ ] 3.4 SDK 55 → 56 (verify with the per-step checks)
- [ ] 3.5 SDK 56 → 57 (verify with the per-step checks)
- [ ] 3.6 SDK 57 → 58 (verify with the per-step checks; `package.json` shows `expo ~58`, `react-native 0.88.x`)

## 4. Cleanup

- [ ] 4.1 Remove the `kotlinVersion: 1.9.25` pin from `app.json` and any other pins SDK 58 no longer needs. Verify that prebuild and `assembleRelease` still succeed
- [ ] 4.2 Check every screen for edge-to-edge and safe-area problems (Scanner, Capture, Pack, BrowseHome, BoxDetail, ItemDetail, BoxPicker, Settings). Verify by screenshots with no content under the status or navigation bars
- [ ] 4.3 Update `.github/workflows/android.yml` toolchain versions (Node, JDK) if SDK 58 requires them. Verify by a green `workflow_dispatch` run on the branch with the APK artifact uploaded (do not publish the release from the branch)
- [ ] 4.4 Update the tech-stack mentions in `README.md` / `SETUP.md` to SDK 58 / RN 0.88 / New Architecture. Verify that the documented `npm run android` flow works as written

## 5. Integration verification

- [ ] 5.1 Full on-device regression on the CI-built APK, against the existing specs: label-scanning, item-capture, printer-discovery, printer-connection-ux, box/item label printing, print-job-routing, inventory browsing, and save to the production backend. Verify that every flow matches the baseline from 1.2
- [ ] 5.2 Compare APK size and cold start against the baseline and note them in the PR. Verify there's no large regression

## Workflow follow-up

- Merge to `main` (CI publishes the new APK to `android-latest`), and reinstall it on crew devices.
- Archive the change with `/opsx:archive`.
