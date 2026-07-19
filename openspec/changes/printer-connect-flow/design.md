## Context

The printer stack (`mobile/src/niimbot/*`, wired into `Settings.tsx`) was built in the MVP against one physical unit, the Niimbot B1, and the code reflects that literally: hardcoded service/characteristic UUIDs, a proprietary raster protocol, a 384px / 203dpi printhead, and a discovery routine that connects to the *first* BLE device whose advertised name contains `"b1"` or `"niimbot"`. BLE allows a single connection, held by an app-level `printer` singleton (`connection.ts`) that already exposes a subscribe/emit observable the UI listens to.

A product question — *"do we need a vendor list to select from when connecting a printer?"* — triggered a review with a mobile device-pairing UX specialist and a BLE-printer domain expert. Both converged: **no vendor picker.** The app supports exactly one protocol; and vendor **cannot** be reliably auto-detected across brands (cheap printers share Nordic/Telink BLE modules and reuse the same template service UUIDs, so a UUID or name is not a brand identity). The real, high-value work is robust discovery *within* the Niimbot family, model auto-detection, and the connect-flow states that are currently missing.

Constraints: `react-native-ble-plx ^3.5.1`, Expo dev-client / bare workflow (`expo ~52`); Android runtime BLE permissions differ across API 31; iOS does not expose a device's name at scan time in all cases and rotates a per-install peripheral UUID (no stable MAC). Support may only be *claimed* for printer models that are physically tested.

## Goals / Non-Goals

**Goals:**
- Deterministic discovery: never silently connect to the wrong printer; filter by service UUID, anchor the name match, and let the user choose when more than one candidate exists.
- Confirm printer identity on connect (status handshake) before declaring it ready.
- Remembered-device auto-reconnect and the full set of connect-flow states (permission-denied vs Bluetooth-off, no-printer-found recovery, human error messages, diagnostics behind "Advanced").
- Generalize the B1-only hardcode into a Niimbot-family per-model parameter table with model detection and a safe fallback.
- Keep the "no vendor picker" decision explicit, with a passive "Supported printers" reference surface only.

**Non-Goals:**
- Cross-vendor support (Phomemo, Brother, Zebra, Dymo) and any second print protocol (ESC/POS, TSPL, ZPL, Brother-raster).
- A vendor/brand selection UI. Deferred until a second protocol is actually implemented; even then, auto-detect stays the default with a picker only as an ambiguity override.
- Claiming support for Niimbot models that have not been physically tested.
- Changes to label rendering/content (`label.ts`, `font.ts`) beyond feeding them the detected model's width/dpi.

## Decisions

**D1 — No vendor picker; recognize, don't ask.** The BLE advertisement already carries what little identity exists, and asking a non-technical mover to self-identify a brand introduces a whole class of user error ("I picked Brother but it won't connect"). We keep an *internal* model registry that powers recognition and driver params; we never surface it as a pre-scan question. *Alternative considered:* vendor-first dropdown — rejected: implies capability we don't have (one protocol) and is unreliable (vendor not detectable across brands).

**D2 — Service-UUID scan filter as the primary discovery gate, name as a secondary label.** `startDeviceScan([SERVICE_UUID], …)` cuts phones/headphones/etc. from the candidate set and, crucially, still finds **renamed** printers that a name-substring match would miss. The name is then used only to label/rank, with an **anchored** match (prefix/word-boundary) so `"b1"` stops colliding with `B18`, `Room-B1`. *Trade-off:* the template UUID is shared with non-printer devices built on the same module, so a false positive is still possible — which is why identity is confirmed on connect (D4) rather than trusted from the advertisement.

**D3 — Candidate-count-driven connect: one → auto, many → list.** Zero supported candidates → the "not found" recovery state. Exactly one → auto-connect but *show which device was chosen* (single highlighted row) so the user can bail. Two or more → always present a list **sorted by RSSI** (the printer in the user's hand is almost always the strongest signal); never guess. A remembered device, if present in the scan, short-circuits this and reconnects directly. *Alternative considered:* always show a list — rejected as friction for the one-printer common case; *keep silent first-match* — rejected, it is the core bug.

**D4 — Confirm identity with a `GET_STATUS (0xa3)` handshake before "connected".** After GATT connect + characteristic discovery, send the status opcode and require a well-formed `55 55 … AA AA` reply. This is the only reliable "this is a live Niimbot" proof and it filters D2's false positives. Connection is not reported ready to the UI until the handshake succeeds.

**D5 — Per-model parameter table keyed by detected model.** Move B1's `HEAD_PX = 384` / `DOTS_PER_MM = 8` and print-flow quirks out of `client.ts`/`labelSettings.ts` into a `niimbot/models.ts` registry: `{ id, matchNames, width_px, dpi, labelTypeMap, printFlowVariant }`. `printImage` reads width/dpi/print-flow from the selected model. Detection is by anchored name match first, refined by status-response fields where they disambiguate. **Unrecognized Niimbot** devices fall back to a conservative default (B1 params) with a visible "unverified model" note rather than a hard failure. *Rationale:* a 384px assumption corrupts raster on a 96px D11 / 240px B18; the framing layer is shared across the family, only parameters and minor handshake quirks vary.

**D6 — Persist and reconnect by device id.** Store the resolved device id (Android address / iOS peripheral UUID) alongside the existing `moverse.labelSize` key. On entering the printer section or before a print, attempt a background reconnect to that id; on failure, fall back to the connected-state UI with a "Reconnect" affordance, not the cold empty state. iOS's rotating peripheral UUID means reconnect is best-effort; re-scan is always the fallback.

**D7 — State-driven Settings UI, diagnostics demoted.** Rebuild the section around explicit states — empty / scanning (incremental results) / device-picker / not-found / connected / reconnecting / reconnect-failed — with distinct **permission-denied** vs **Bluetooth-adapter-off** messaging, human-readable print/connect errors, and the existing raw **Log moved behind an "Advanced" disclosure** (kept, with Copy, for support). Header drops the hardcoded "(NIIMBOT B1)"; the recognized model shows in the connected status. A quiet "Supported printers" link appears on empty/not-found states.

## Risks / Trade-offs

- **Shared template service UUID → false-positive candidates** → confirm identity via the `GET_STATUS` handshake (D4) before reporting connected; non-responders are dropped from the picker.
- **iOS name-null-at-scan and rotating peripheral UUID** → rely on the service-UUID filter (not name) for discovery, label devices by whatever name/RSSI is available, and treat remembered-device reconnect as best-effort with re-scan fallback (D6).
- **Untested Niimbot models could misprint** → the model table only *claims* support for physically verified units; unknown models use the safe fallback with a visible "unverified" note rather than silently sending 384px raster to a 96px head (D5).
- **Anchored name match could exclude a legitimately renamed device** → the service-UUID filter (D2) still surfaces it in the candidate list even when the name doesn't match, so the user can still select it.
- **Auto-reconnect racing a manual connect** → the single `printer` singleton serializes connections; reconnect checks the current state and no-ops if a connect/print is already in flight.
- **Scope creep toward multi-vendor** → explicitly deferred (Non-Goals); the model registry is intentionally Niimbot-family-shaped, and the "vendor abstraction" is not built until a second protocol exists.
