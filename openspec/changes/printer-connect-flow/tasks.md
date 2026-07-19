## 1. Model registry (Niimbot family)

- [ ] 1.1 Create `mobile/src/niimbot/models.ts` with a `NiimbotModel` type `{ id, label, matchNames, width_px, dpi, labelTypeMap, printFlowVariant, verified }` and a registry array
- [ ] 1.2 Populate the registry with the physically-tested B1 entry (384px, 203dpi/8 dpmm, current print-flow) and mark it `verified: true`; add unverified stubs (e.g. B21/B18/D11) only as commented placeholders, not claimed-supported
- [ ] 1.3 Add a conservative default/fallback model (B1 params) and a `detectModel(name, statusResp?)` helper using anchored name match, refined by status fields where they disambiguate
- [ ] 1.4 Move `HEAD_PX`/`DOTS_PER_MM` out of `labelSettings.ts` and `client.ts` to read from the selected model; keep `labelSettings` label-size logic intact

## 2. Discovery layer (`transport.ts`)

- [ ] 2.1 Change `startDeviceScan` to filter by the Niimbot SERVICE UUID instead of `null` (all services)
- [ ] 2.2 Replace substring `.includes("b1")/"niimbot"` with an anchored name matcher; retain candidates that advertise the service UUID even when the name is null (iOS)
- [ ] 2.3 Collect all candidates over the scan window with their RSSI instead of resolving on first match; return `{ candidates: [{device, name, rssi}], }` sorted by RSSI desc
- [ ] 2.4 On connect, after `discoverAllServicesAndCharacteristics`, send `GET_STATUS (0xa3)` and require a well-formed `55 55…AA AA` reply before reporting ready; drop non-responders
- [ ] 2.5 Return the resolved device id (peripheral/address) for persistence

## 3. Connection singleton (`connection.ts`)

- [ ] 3.1 Split `connect()` into `scan()` (returns candidates) and `connectTo(deviceId | device)` (single selection + handshake confirm)
- [ ] 3.2 Add `reconnectRemembered()` that reads the persisted device id and attempts a background reconnect; no-op if a connect/print is already in flight
- [ ] 3.3 Persist the device id on successful connect and expose the detected model on the observable state; add `forget()` to clear it
- [ ] 3.4 Add a persisted `moverse.lastPrinter` storage key (alongside `moverse.labelSize`)

## 4. Print path (`client.ts`)

- [ ] 4.1 Parameterize `printImage` on the selected model's `width_px`/`dpi`/`printFlowVariant`; remove the B1-only hardcodes
- [ ] 4.2 Verify the existing B1 print-flow maps to `printFlowVariant: 'b1'` and is unchanged in behavior (no regression to the blank/multi-page fixes)

## 5. Settings UI states (`Settings.tsx`)

- [ ] 5.1 Drop the hardcoded "(NIIMBOT B1)" header; render the recognized model in the connected status instead
- [ ] 5.2 Implement explicit states: empty / scanning (incremental) / device-picker (RSSI-sorted) / not-found / connected / reconnecting / reconnect-failed
- [ ] 5.3 Wire single-candidate auto-connect (show chosen device) vs multi-candidate list (tap to connect)
- [ ] 5.4 Split permission-denied (Open Settings + Try again) from Bluetooth-adapter-off (turn on Bluetooth) messaging
- [ ] 5.5 Build the "no printer found" recovery state with a causes checklist + "Search again"
- [ ] 5.6 Call `reconnectRemembered()` on entering the printer section; fall back to a "Reconnect" affordance on failure (not the cold empty state)
- [ ] 5.7 Map connect/print failures to human messages (out of range / out of labels / lid open / busy)
- [ ] 5.8 Move the raw Log (with Copy) behind a collapsed "Advanced" disclosure
- [ ] 5.9 Add a passive "Supported printers" reference link on the empty and not-found states
- [ ] 5.10 Add a "Forget this printer" action in the connected state

## 6. Print trigger (`App.tsx`)

- [ ] 6.1 Ensure the hub print path (`startAdd` assign branch) uses the detected model params and attempts `reconnectRemembered()` before falling back to the write-by-hand screen

## 7. Verify

- [ ] 7.1 Physical test on the Niimbot B1: fresh connect (single candidate), test print, and a real item label — confirm no raster regression
- [ ] 7.2 Multi-candidate test: two BLE printers powered on → verify RSSI-sorted list appears and the chosen one connects (no silent first-match)
- [ ] 7.3 Recovery paths: permission denied, Bluetooth off, and no-printer-found each show the correct distinct state
- [ ] 7.4 Remembered-device reconnect: relaunch/return to section reconnects without a manual Connect tap
- [ ] 7.5 iOS pass: confirm service-UUID discovery works when advertised name is null at scan time
