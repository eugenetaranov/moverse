## 1. One-time setup (Airtable + labels)

- [x] 1.1 Create the Airtable base "Moverse" with a **Boxes** table (`Box Code`, `Type` [Suitcase|Shipping box], `Destination` [With me|Shipment], `Name / Notes`, `Status` [Packing|Sealed|Arrived], `Items` link)
- [x] 1.2 Create the **Items** table (`Item Code`, `Photo` attachment, `Description`, `Box` link → Boxes, `Destination` lookup from Box, `Created` time [via `CREATED_TIME()` formula])
- [ ] 1.3 Add a **Gallery view** on Items grouped by `Box`, and a Grid view filtered to `Destination = With me`
- [x] 1.4 Create an Airtable personal access token scoped to the base; note the base ID and the `Photo` field ID
- [x] 1.5 _(superseded: labels are now generated and printed in-app via the NIIMBOT B1/D110 integration, not pre-printed through the official app)_

## 2. Cloudflare Worker proxy

- [x] 2.1 Scaffold a Worker project (`wrangler`) and set secrets: `ANTHROPIC_API_KEY`, `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID` (+ optional shared `APP_SECRET` header)
- [x] 2.2 Implement `POST /describe` `{ imageBase64 }` → `{ description }` calling `claude-haiku-4-5` with a base64 `image` block, terse ≤10-word prompt, `max_tokens ~150`
- [x] 2.3 Implement `POST /save` `{ itemCode, boxCode, description, imageBase64 }`: find-or-create the Box row, create the Item row (with Box link + description), then upload the photo via Airtable's Upload Attachment content API
- [x] 2.4 Add error handling (upstream failure → clean error response) and avoid logging payloads; deploy the Worker and record its URL
- [x] 2.5 Verify both endpoints with `curl` (see spec scenarios): `/describe` returns a short phrase; `/save` creates an Item with photo + box link

## 3. Expo app — scaffolding & scanning

- [x] 3.1 `create-expo-app`, add `expo-camera`, configure Android `CAMERA` permission via the config plugin
- [x] 3.2 Build a reusable scan component (`CameraView` + `onBarcodeScanned`) that decodes a QR and returns its value
- [x] 3.3 Implement prefix routing/validation: accept only the expected type per step (`ITM-` vs `BOX-`), reject wrong-type and unrecognized codes with a clear message
- [x] 3.4 Handle camera-permission granted/denied states with an actionable message

## 4. Expo app — capture workflow

- [x] 4.1 Item-scan step → capture item code, advance to photo
- [x] 4.2 Photo step: `takePictureAsync`, downscale to ~1024px long edge + JPEG-compress, allow retake
- [x] 4.3 `lib/api.ts`: `describe(imageBase64)` and `save(payload)` calls to the Worker
- [x] 4.4 Description step: call `/describe`, show result in an editable field (accept or edit), handle failure (retry / manual entry)
- [x] 4.5 Box-assignment step: scan a `BOX-` code (validate prefix); optional quick-pick of a recent box
- [x] 4.6 Confirm & save: call `/save`, show success and loop to item-scan; on error keep state and allow retry

## 5. End-to-end verification & build

- [x] 5.1 Run the full flow in Expo Go on the Android phone: scan `ITM-*` → photo → confirm description → scan `BOX-*` → save
- [ ] 5.2 Confirm in Airtable: the item appears in the Gallery view under the correct box, photo visible; the "With me" filter lists only suitcase items
- [ ] 5.3 Verify reassign: change an item's `Box` link in Airtable and confirm the gallery regroups
- [x] 5.4 _(superseded by apk-distribution: standalone APK is built by GitHub Actions and published to the rolling `android-latest` Release)_
