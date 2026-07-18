## 1. Publish the APK to a GitHub Release

- [x] 1.1 Add `permissions: { contents: write }` to `.github/workflows/android.yml` so the job can create/update Releases
- [x] 1.2 After `assembleRelease`, copy `mobile/android/app/build/outputs/apk/release/app-release.apk` to a stable `moverse.apk`
- [x] 1.3 Add a `softprops/action-gh-release@v2` step: rolling `tag_name: android-latest`, `prerelease: true`, `make_latest: false`, `files: moverse.apk`, and a name/body carrying the commit SHA + `app.json` version
- [x] 1.4 Keep the existing `upload-artifact` step as a fallback
- [x] 1.5 Confirm the trigger is unchanged (push to `main` on `mobile/**` + `.github/workflows/android.yml`, plus `workflow_dispatch`)

## 2. Documentation

- [x] 2.1 Update `SETUP.md`: replace the `eas build -p android` instructions with the Release-link install flow (open `android-latest` link on the phone, allow "install unknown apps", tap the APK); note the backend is `https://moverse-chi.vercel.app`
- [x] 2.2 Update `README.md` to point at the Release link as the way to install a test build

## 3. Verification

- [ ] 3.1 Trigger the workflow (push to `main` or **Run workflow**) and confirm the run is green (`gh run watch`)
- [ ] 3.2 Confirm the Release exists with the asset: `gh release view android-latest` lists `moverse.apk`
- [ ] 3.3 On the Android phone, open the download URL, install the APK, launch **Moverse**
- [ ] 3.4 Run one capture end to end and confirm the `/save` write reaches `moverse-chi.vercel.app` (new Item in Airtable). `/describe` requires `ANTHROPIC_API_KEY` in Vercel (deferred)
