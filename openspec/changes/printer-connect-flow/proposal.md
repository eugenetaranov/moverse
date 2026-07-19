## Why

The label-printer connection in Settings is hardcoded to a single model (Niimbot B1) and connects by grabbing the **first** BLE device whose advertised name merely *contains* `"b1"` or `"niimbot"`. That silently mis-connects when more than one printer is nearby (job site, neighboring crew), the `"b1"` substring collides with unrelated names (`B18`, `Room-B1`), and there is no remembered-device reconnect, no real "printer not found" recovery, and a raw debug log stands in for human error messages. This is where non-technical movers lose time and file "it won't find my printer" tickets. A product question also prompted this: *do we need a vendor list to pick from?* — the answer is no (we support one protocol, and vendor can't be reliably auto-detected across brands anyway), so this change scopes the work to what actually helps.

## What Changes

- **Discovery is made robust and deterministic** (no behavior a user would call "random"):
  - Scan is **filtered by the Niimbot service UUID** to cut the candidate set before name logic runs.
  - Name matching is **anchored** (word-boundary / prefix) so `"b1"` no longer false-matches `B18`, `Room-B1`, etc., and renamed devices are still reachable via the UUID filter.
  - **Exactly one candidate → auto-connect** (and show which device was chosen); **two or more → show a device list sorted by signal strength (RSSI)** so the user picks the printer in their hand. No more silent first-match.
  - Identity is **confirmed on connect** via a `GET_STATUS` handshake before the printer is declared ready; iOS `null`-name-at-scan is handled.
- **The connect flow gains its missing states**: distinct **permission-denied vs Bluetooth-off** handling, a real **"no printer found"** recovery screen with a checklist, **remembered-device auto-reconnect** on entering the section / before printing, and **human error messages** ("Print failed — check labels and lid") with the debug **Log tucked behind an "Advanced" disclosure** instead of front-and-center.
- **Niimbot-family model support** replaces the B1-only hardcode: a per-model parameter table (`width_px`, `dpi`, label-type map, print-flow variant) keyed by the **detected model**, so supported models beyond the B1 print correctly (a 384px assumption corrupts raster on 96px D11 / 240px B18). Support is claimed **only for physically tested models**; unknown Niimbot devices fall back to a safe default with a clear note.
- **No vendor/brand picker.** The section header stops asserting "(NIIMBOT B1)"; the recognized model is shown in the *connected* status instead. A passive **"Supported printers"** reference link appears on empty / not-found states (marketing/support surface, not part of the connect flow). A vendor picker is explicitly deferred until a second printer protocol is actually implemented.

## Capabilities

### New Capabilities
- `printer-discovery`: The BLE scan and device-identification layer — service-UUID scan filter, anchored name matching, RSSI-sorted candidate handling (single-device auto-connect vs multi-device list), `GET_STATUS` handshake confirmation, iOS name-at-scan handling, and persisted device id for reconnect.
- `printer-connection-ux`: The Settings printer connect experience and its states — empty, scanning, device-picker, no-printer-found recovery, connected, reconnecting/reconnect-failed; permission-denied vs Bluetooth-off; remembered-device auto-reconnect; human error messaging with an "Advanced" diagnostics disclosure; and the "Supported printers" reference link. No vendor picker.
- `printer-model-support`: Niimbot-family model support — a per-model parameter table (printhead width px, dpi, label-type map, print-flow variant), model detection from the advertised name / status response, a safe fallback for unrecognized models, and the removal of the B1-only hardcode.

### Modified Capabilities
<!-- The printer stack was built in the MVP but has no archived spec under openspec/specs/ (specs dir is empty), so there is no baseline delta to write; the printer capabilities above are recorded as new. -->

## Impact

- **Mobile app** (`mobile/src/`):
  - `niimbot/transport.ts` — scan filtered by service UUID, anchored name match, return the candidate set with RSSI (not first-match), handshake-confirm on connect, iOS null-name handling, persisted peripheral/MAC id.
  - `niimbot/connection.ts` — `connect()` gains device-selection and reconnect-by-id; observable already in place is reused for the new states.
  - `Settings.tsx` — the connect section is rebuilt around explicit states (empty / scanning / device-list / not-found / connected / reconnecting), permission-vs-adapter messaging, "Advanced" disclosure for the existing Log, "Supported printers" link, and the header no longer hardcodes the model.
  - `niimbot/client.ts` + `labelSettings.ts` — B1 constants (`HEAD_PX = 384`, `DOTS_PER_MM = 8`) move into a per-model table keyed by detected model; `printImage` reads width/dpi/print-flow from the selected model.
  - New small module for the model registry (e.g. `niimbot/models.ts`) and a persisted last-device key alongside the existing `moverse.labelSize`.
- **BLE library**: no new dependency — continues on `react-native-ble-plx ^3.5.1`. Uses its RSSI, `localName`/`name`, and service-UUID scan-filter APIs.
- **Permissions**: unchanged set (`BLUETOOTH_SCAN`/`BLUETOOTH_CONNECT`, or `ACCESS_FINE_LOCATION` &lt; API 31); denied/off paths are surfaced rather than dead-ended.
- **Out of scope**: cross-vendor support (Phomemo/Brother/Zebra/Dymo), any vendor picker UI, and ESC/POS or ZPL drivers — deferred until a second protocol is implemented. Model support is limited to Niimbot units that are physically tested.
