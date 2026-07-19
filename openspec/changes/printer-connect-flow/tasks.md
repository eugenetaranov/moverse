> Much of §1/§3/§4 was delivered by the `multi-printer-roles` change (model
> registry, scan/connectTo split, per-model width, reconnect/forget). This change
> completes the discovery robustness and connect-UX pieces on top.

## 1. Model registry (Niimbot family)

- [x] 1.1 `mobile/src/niimbot/models.ts` with a `NiimbotModel` type + registry _(via multi-printer-roles)_
- [x] 1.2 B1 entry `verified: true`; D11/D110/B18/B21 as detected-but-unverified entries
- [x] 1.3 `DEFAULT_MODEL` fallback + `detectModel(name)` anchored match
- [x] 1.4 Width read from the selected model (`model.widthPx`) in the render/print path; `labelPx` caps width at the printhead _(dpi is a shared 8px/mm; a single print-flow serves B1+D110, so no per-model flow field was needed)_

## 2. Discovery layer (`transport.ts`)

- [x] 2.1 Accept devices by advertised **service UUID** (`dev.serviceUUIDs`) — scanning all services (Niimbot ad packets don't reliably carry the service) and accepting on service OR name, which achieves the "cut false matches" intent without missing printers that omit the service in the ad
- [x] 2.2 Anchored name matcher (`isNiimbotName`) replacing substring includes — `"b1"` no longer false-matches `Room-B1`/`B18`
- [x] 2.3 Collect all candidates over the scan window with RSSI, sorted desc _(via multi-printer-roles `scanPrinters`)_
- [x] 2.4 `GET_STATUS` handshake after connect (`client.ping()`) — best-effort/logged rather than a hard drop, to avoid regressing a working but slow-to-reply printer
- [x] 2.5 Return the resolved device id for persistence _(via multi-printer-roles)_

## 3. Connection singleton (`connection.ts`)

- [x] 3.1 `scan()` + `connectNew(deviceId)` split _(via multi-printer-roles)_
- [x] 3.2 `reconnectRemembered()` background reconnect _(via multi-printer-roles)_
- [x] 3.3 Persist device id, expose detected model, `forget()` _(via multi-printer-roles)_
- [x] 3.4 Persisted printer storage — `moverse.printers` (the multi-printer set) supersedes a single `moverse.lastPrinter`

## 4. Print path (`client.ts`)

- [x] 4.1 `printImage` uses the selected model's width (via `labelPx(size, model.widthPx)`); B1-only 384 hardcode removed from the render path
- [x] 4.2 B1 print-flow behavior unchanged (client protocol untouched — no regression to the blank/multi-page fixes)

## 5. Settings UI states (`Settings.tsx`)

- [x] 5.1 No hardcoded "(NIIMBOT B1)" — each printer card shows its detected model
- [x] 5.2 States: empty / scanning (spinner+cancel) / device-picker / not-found / connected _(reconnect is a silent background attempt; no separate reconnecting screen)_
- [x] 5.3 Single-candidate auto-connect (logs the chosen device) vs multi-candidate RSSI-sorted picker modal
- [x] 5.4 Permission-denied vs Bluetooth-off split (adapter state check + distinct messages)
- [x] 5.5 "No printer found" recovery (causes + "Search again")
- [x] 5.6 `reconnectRemembered()` on entering the section _(via multi-printer-roles)_
- [x] 5.7 Human error messages on print failure (connect/print alerts in the assign flow) _(connect-scan errors still logged)_
- [x] 5.8 Raw Log tucked away — behind a "View log" modal (per-printer + combined) rather than inline
- [x] 5.9 "Supported printers" reference link on the empty state
- [x] 5.10 "Forget this printer" — the per-printer Disconnect calls `forget()`

## 6. Print trigger (`Pack.tsx`)

- [x] 6.1 Hub assign/print path uses detected model params and `reconnectRemembered()` before the write-by-hand fallback

## 7. Verify (hardware — user)

- [ ] 7.1 B1: fresh connect (single candidate), test print, real item label — no raster regression
- [ ] 7.2 Two printers powered on → RSSI-sorted picker appears, chosen one connects (no silent first-match)
- [ ] 7.3 Recovery paths: permission denied, Bluetooth off, no-printer-found each show the correct distinct state
- [ ] 7.4 Remembered-device reconnect on relaunch/return without a manual Connect tap
- [ ] 7.5 iOS: service-UUID discovery works when the advertised name is null at scan time
