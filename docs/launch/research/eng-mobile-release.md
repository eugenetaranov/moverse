# Moverse: plan for shipping to Google Play and the App Store (Nov 2026)

**The biggest blocker:** we can't ship to either store on Expo SDK 52 as it stands. Since Apr 28, 2026, Apple only accepts uploads built with Xcode 26 and the iOS 26 SDK. Since Aug 31, 2026, Google Play requires new apps to target API 36. Expo recommends at least SDK 54 for Xcode 26, and SDK 52 isn't confirmed to work with it. We are on SDK 52 with RN 0.76 (`mobile/package.json`). The first engineering task is to upgrade to the current stable SDK (58 is in beta). SDK 55 and later run only on the New Architecture, so react-native-ble-plx has to be re-checked on real hardware afterwards.

## 1. Google Play
- **Account:** use an **Organization** account. The fee is a one-time $25. It needs a D-U-N-S number (free, but can take up to 30 days), and the legal name and address must match the D&B record.
- **12 testers / 14 days:** this rule applies only to *personal* accounts created after Nov 13, 2023. Organization accounts are exempt. That changes `openspec/changes/commercial-mvp` task 7.3 and the apk-distribution spec, which both assume the rule applies. A closed track for the beta crews is still worth running, but it's no longer required.
- **Data safety form:** declare photos, account data (email), and that photos and text are sent to Anthropic for `/describe`. It also has deletion questions.
- **Account deletion:** two things are required.
  - There must be a prominent in-app path (platform-foundation task 5.10 covers it).
  - There must also be a **public web URL** where users can request deletion without reinstalling the app. That URL goes into the data safety form.
- **Target API:** API 36 for new apps and updates (deadline was Aug 31, 2026). The SDK upgrade handles this.
- **Review:** no fixed SLA, "up to 7 days". New accounts often see 7–14 days.
- **Dev APK:** Android developer verification for sideloaded apps started Sep 30, 2026 in BR/ID/SG/TH and goes global in 2027. Our debug-signed APK will eventually need registering in the Android Developer Console.

## 2. Apple Developer Program
- **Account:** $99/yr, organization enrollment with D-U-N-S. Apple quotes up to 5 business days for D&B plus 2 days for the record to reach Apple. Forum reports show enrollments stuck "processing" for 2–3+ weeks, so budget 3–4 weeks in total.
- **TestFlight:** internal testers don't need Beta App Review. External testers go through a short first review.
- **Privacy:** fill in nutrition labels (same data types as the Play form). A privacy manifest (`PrivacyInfo.xcprivacy`) is needed for required-reason APIs; Expo generates it, and we add declarations under `ios.privacyManifests` in app.json.
- **Account deletion (5.1.1(v)):** in-app deletion is mandatory whenever the app supports account creation.
- **Sign in with Apple:** **not needed.** Guideline 4.8 only applies when a third-party or social login is offered, and it exempts apps that "exclusively use your company's own account setup and sign-in systems". Email OTP plus password qualifies. If we ever add Google sign-in, we'd have to add an equivalent privacy-preserving option.
- **Demo account (2.1):** the reviewer needs working credentials. Supabase email OTP sends codes to a real inbox, so give the reviewer a **password** login for a seeded company-owner account with a populated job. Also include notes explaining crew invites and that the NIIMBOT printer is optional hardware.

## 3. iOS engineering risks (from reading the code)
- **BLE library:** react-native-ble-plx supports iOS. These need fixing before iOS works:
  - **Wait for Bluetooth to be ready:** `scanPrinters` and `connect` in `mobile/src/niimbot/transport.ts` call `startDeviceScan` straight away. On iOS the manager starts in an `Unknown` state, so the scan will fail. Wait for `PoweredOn` first (`onStateChange(..., true)`).
  - **Device ids:** on iOS, `dev.id` is a per-phone CoreBluetooth UUID, not a MAC address. Saved printers in `mobile/src/niimbot/roles.ts` stay local, which is fine, but those ids must never be synced or shared.
  - **MTU:** `requestMTU: 200` only works on Android. iOS negotiates the MTU itself (~185), and the chunking based on `connected.mtu` already handles that.
  - **Write flow control:** `writeWithoutResponse` floods can drop packets on iOS. The `writeAck` path should become the default on iOS, and we need to test on a real B1.
- **Permission strings:** add `bluetoothAlwaysPermission` to the ble-plx plugin in `mobile/app.json`; without it the app crashes the first time BLE is used. The camera string is already set. Add a photo-library string if we ever save to the gallery. On iOS, `requestBlePerms` (`mobile/src/blePerms.ts`, plus a duplicate in `mobile/src/Settings.tsx`) returns true without asking, which is fine because iOS shows its own prompt.
- **Bundle ID:** set `ios.bundleIdentifier`. Ideally it would match the Android package `me.taranov.moverse`, but both IDs are permanent once the app is published, so decide now whether we want a company domain like `app.moverse` instead.

## 4. Build and release pipeline
Recommendation: use **EAS Build + EAS Submit**, because building iOS on GitHub Actions means maintaining macOS runners and fastlane match. Keep `.github/workflows/android.yml` for the dev APK, and add a GH Action that runs `eas build --profile production --auto-submit`.
- **Signing:**
  - **Android:** EAS-managed upload keystore with Play App Signing.
  - **iOS:** EAS creates and stores the distribution certificate and provisioning profile using an App Store Connect API key.
- **Profiles:** `development` (dev client), `preview` (internal APK or TestFlight, staging Supabase), `production` (AAB/IPA, prod). Each profile gets its own `env`.
- **Versioning:** `appVersionSource: remote` with `autoIncrement` for versionCode and buildNumber; the marketing version stays in app.json.
- **OTA:** EAS Update channels that match the profiles, with `runtimeVersion: {policy: "fingerprint"}`. JS-only fixes are allowed; anything that changes features still needs store review.
- **EAS pricing:**
  - **Free:** 15 Android + 15 iOS builds/mo, 1k Update MAUs.
  - **Starter:** $19/mo, $45 build credit (about $1 per Android build, $2 per iOS build), 3k MAUs.
  - **Production:** $199/mo, $225 credit, 50k MAUs.
  - **Starter is enough.**

## 5. Store listing assets
- **Icons:** 512² Play icon and 1024² App Store icon with no alpha channel.
- **Play feature graphic:** 1024×500.
- **Screenshots:** Play needs at least 2 phone screenshots. iOS needs the 6.9" set (1320×2868), and iPad screenshots too unless we set `supportsTablet: false`.
- **Text:** Play short description (80 chars) and long description (4000). iOS subtitle (30), promo text (170), description, keywords (100).
- **Category:** Business on both stores, or Productivity.
- **Content rating:** IARC questionnaire on Play (expect Everyone). Apple's age-rating questionnaire (expect 4+).
- **Privacy:** a privacy-policy URL is required on both stores.
- **Deep links:**
  - Serve `https://<domain>/.well-known/assetlinks.json` with the **Play App Signing** SHA-256 (not the upload key) and `android.intentFilters` with `autoVerify`.
  - Serve `/.well-known/apple-app-site-association` (JSON, no redirects) and set `ios.associatedDomains: ["applinks:<domain>"]`.
  - Use these for crew-invite links.

## 6. In-app purchases
- **Apple:**
  - Web-only billing with no purchase UI is acceptable. 3.1.3(c) (enterprise services sold to organizations) and the multiplatform rule cover access to plans bought elsewhere.
  - The personal free tier must stay free and **have no upgrade CTA** outside the US.
  - In the US storefront, external purchase links are now allowed (3.1.1(a)).
- **Play:** no in-app purchase flow and no steering means Play Billing isn't required.
- eng-payments should confirm the details.

## Timeline (start now)
| Week | Steps |
|---|---|
| 0 | Request D-U-N-S. Register a domain/email. Start the Expo SDK upgrade branch. |
| 1–4 | D-U-N-S arrives. Enroll in Play (Org) and Apple (Org); Apple can take 3+ weeks. In parallel: SDK upgrade, iOS BLE fixes, permission strings, bundle ID, eas.json profiles. |
| 3–5 | Privacy policy and deletion web page live. AASA and assetlinks deployed. Assets and copy done. Data-safety form and nutrition labels filled. |
| 5–6 | Play internal and closed tracks for beta crews. TestFlight internal, then external (1–2 days review). Test BLE on iPhone with a B1. |
| 7–8 | Production submissions: Apple 1–3 days (first release can take up to 5); Play up to 7–14 days for a new account. |

Realistically we can be live in both stores about **8 weeks** from requesting the D-U-N-S number. The critical paths are D-U-N-S plus Apple enrollment, and the SDK upgrade.

## Sources

Many details (review times, D-U-N-S waits, ble-plx on the New Architecture) come from third-party sources. Apple's 4.8 and 5.1.1 text, Expo pricing and Play's deletion policy were checked on the official pages.

**Google**
- [Play 12-tester rule (org exempt)](https://www.choicely.com/blog/google-play-12-tester-rule)
- [Target SDK](https://developer.android.com/google/play/requirements/target-sdk)
- [Play account deletion](https://support.google.com/googleplay/android-developer/answer/13327111)
- [Play org/D-U-N-S](https://afkarsoftware.com/en/blog-detail/google-play-personal-vs-organization-duns-2026/)
- [Sideload verification](https://thehackernews.com/2026/06/google-sets-sept-30-deadline-for.html)

**Apple**
- [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple SDK requirement](https://developer.apple.com/news/upcoming-requirements/)
- [Apple D-U-N-S](https://developer.apple.com/support/D-U-N-S/)
- [Enrollment delays](https://developer.apple.com/forums/thread/819990)

**Expo and BLE**
- [Expo on SDK 26](https://expo.dev/blog/app-store-connect-minimum-sdk-26)
- [EAS pricing](https://expo.dev/pricing)
- [ble-plx config plugin](https://www.npmjs.com/package/@config-plugins/react-native-ble-plx)

**Review times**
- [Review times](https://studio.adalo.com/blog/how-long-does-app-store-review-take)
