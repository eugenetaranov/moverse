# Design

## Context

See proposal.md - Why. Current state:

- Expo SDK 52, RN 0.76.5, React 18.3.1, Hermes on, `newArchEnabled=false`.
- `mobile/android/` is gitignored. CI (`.github/workflows/android.yml`) runs `expo prebuild --platform android` and then `./gradlew assembleRelease` (arm64-v8a only) on Node 22 and JDK 17, and publishes to the `android-latest` release.
- Native-dependent features: QR scanning and photo capture through `expo-camera` `CameraView`, and NIIMBOT BLE printing through `react-native-ble-plx` (a single shared `BleManager` in `src/niimbot/ble.ts`).
- There's no automated test suite for the mobile app, so verification is manual on a real Android phone with a NIIMBOT printer.

## Goals / Non-Goals

**Goals:**
- Reach Expo SDK 58 / RN 0.88 with the New Architecture on, and keep every existing feature working.
- Keep every intermediate SDK step buildable so a regression can be bisected to one step.

**Non-Goals:**
- Adopting EAS Build or EAS Update, iOS builds, or Expo Router.
- Refactors or UI changes beyond what API breaks force.
- Upgrading to React Navigation 8, or any other major version SDK 58 doesn't require.

## Decisions

1. **One SDK per step, not a jump straight to 58.** Expo's upgrade guides and codemods assume one version at a time, and each step's changelog lists its breaking changes. *Alternative:* bump straight to 58. That's faster when it works, but a failure could come from any of six releases' worth of changes and is hard to pin down.

2. **Spike `react-native-ble-plx` on the New Architecture before the SDK steps.** BLE printing is the feature most likely to break, and it can't be replaced quickly. Turn on `newArchEnabled` on SDK 52 (with the latest compatible ble-plx) and test-print first. If ble-plx doesn't work there, decide on a fix before doing the SDK steps. *Fallback:* move to a maintained fork or alternative BLE library behind the existing `niimbot/transport.ts` interface. Because the transport is already abstracted, only `ble.ts` and `transport.ts` would change.

3. **Let SDK defaults replace manual pins.** Remove the `kotlinVersion` pin unless a build fails without it. Use `npx expo install --fix` versions for all Expo-managed packages, and don't hand-pick versions.

4. **Verify each step in CI.** Each step runs `npx expo-doctor`, `npx tsc --noEmit`, and a local or CI `assembleRelease`. The full on-device smoke test is required only at the New Architecture spike and at SDK 58, with a lighter launch-and-scan check at intermediate steps.

5. **Work on a branch; merge to `main` only at SDK 58.** Pushing to `main` publishes the APK that crews install, so intermediate SDKs never ship.

## Risks / Trade-offs

- [ble-plx incompatible with, or flaky on, the New Architecture] → Decision 2 spike; fallback library behind the transport interface.
- [Android edge-to-edge became the default in newer SDKs and target APIs, so headers or tab bars may slide under the system bars] → check every screen at SDK 58 and fix with safe-area insets.
- [`expo-camera` or `expo-file-system` API moves (for example, the legacy file-system API split)] → follow the codemods and changelog notes at each step; check that `tsc` passes.
- [The CI toolchain (JDK, Gradle, Node) falls behind what RN 0.88 needs] → bump versions in `android.yml` at the step where the build first fails.
- [A larger APK or slower CI build] → compare APK size and build time before and after. That's acceptable unless the change is large.

## Migration Plan

Work happens on branch `upgrade-expo-sdk`. Merging to `main` lets CI publish the new APK to `android-latest`, and crews update by reinstalling from the same link. **Rollback:** revert the merge commit. CI then republishes an SDK 52 APK to the same URL.

## Open Questions

- Whether any intermediate SDK needs a temporary third-party patch (`patch-package`). That will only be known while doing the step.
