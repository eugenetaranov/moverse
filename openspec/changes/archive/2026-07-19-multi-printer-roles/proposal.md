## Why

The printer stack assumes **one** printer. `connection.ts` is a single `printer`
singleton (one transport, one client, one name), and every print call goes
straight to `printer.client.printImage(...)`. That is fine for most users — the
common case is **zero or one** printer — but it can't express the setup this move
actually uses: **two printers with different jobs**. A larger printer (Niimbot B1,
384px head, 45×80mm stock) is right for **box labels** (QR + code + phone/address
extra text); a small printer (Niimbot D11, ~96px head, narrow tape) is right for
**item labels** (short code, text-first). Today you'd have to disconnect one and
reconnect the other between every box and item — the connection is exclusive and
role-blind, so the wrong-sized label comes out or the flow stalls.

This also corrects a latent wrong assumption in the code: the comment "BLE allows
a single connection at a time" is false — a BLE central connects to several
peripherals at once. Nothing but our own singleton forces one-printer-at-a-time.

## What Changes

- **Multiple printers can be connected at once.** The single `printer` singleton
  becomes a **manager over a set of managed printers**, each with its own
  transport/client, keyed by device id, connected/disconnected independently. The
  connected set (id, name, detected model, role) is persisted so both come back on
  next launch.
- **Each printer is assigned a role** — what it is allowed to print: **Item
  labels**, **Box labels**, or **Any** (both). Assignment lives in Settings, one
  control per connected printer, and is persisted per device id.
- **Print jobs are routed by role, not by "the printer".** Printing an item label
  asks the manager for the printer that handles **item** labels; printing a box
  label asks for the **box** printer. Call sites stop reaching into
  `printer.client` directly.
- **The common cases stay zero-friction.** With **zero** printers, everything
  falls back to write-by-hand exactly as today. With **exactly one** printer, it
  defaults to role **Any** and prints both kinds with **no configuration** — the
  role UI only becomes meaningful once a second printer is added.
- **Missing-role is a real, recoverable state.** If a job's kind has no connected
  printer for it (e.g. the item printer is off, or both printers are assigned to
  boxes so nothing prints items), the user gets a clear message with recovery —
  connect/assign a printer, print on the other one anyway, or write by hand —
  instead of a silent wrong-size print or a dead flow.

This change is **additive on top of `printer-connect-flow`** (discovery, model
detection, per-model width/dpi, human error messaging). It reuses that change's
`detectModel` / model registry to know a printer's head width, and its
device-picker to choose *which* device to connect — then adds the *set* and the
*roles* on top. Where the two touch the same files, this change assumes
`printer-connect-flow` lands first.

## Capabilities

### New Capabilities
- `printer-registry`: A manager over a **set** of managed printers replacing the
  single-connection singleton — per-device transport/client, independent
  connect/disconnect, an observable connected set, and persistence of the set
  (device id, name, detected model, role) for reconnect on launch. Supports
  connecting an additional printer without dropping the first.
- `printer-role-assignment`: The per-printer **role** model (`item` | `box` |
  `any`), its defaults (a lone printer defaults to `any`), persistence keyed by
  device id, the Settings UI to assign roles per connected printer, and the
  guidance shown when an assignment leaves a label kind uncovered or double-covered.
- `print-job-routing`: Resolving a **label kind** (item / box) to the printer that
  should print it — exact-role preferred over `any`, deterministic among ties —
  and the missing-printer-for-kind recovery (assign/connect, use the other printer,
  or write by hand). Call sites request a printer by kind instead of using a global
  client.

### Modified Capabilities
<!-- printer-connect-flow's capabilities (printer-discovery, printer-connection-ux,
printer-model-support) are a sibling pending change, not an archived baseline under
openspec/specs/, so there is no published delta to amend here. The registry
generalizes that change's single-connection model to a set; that relationship is
recorded in design.md, and the capabilities above are new. -->

## Impact

- **Mobile app** (`mobile/src/`):
  - `niimbot/connection.ts` — the biggest change: `printer` singleton becomes a
    `PrinterManager` holding `Map<deviceId, ManagedPrinter>`; `connect()` gains
    "add another" semantics; per-printer `disconnect(id)`; observable emits the
    whole set; `printerForKind(kind)` resolver; `reconnectRemembered()` restores
    the persisted set.
  - New `niimbot/roles.ts` (or extend `labelSettings.ts`) — `PrinterRole` /
    `LabelKind` types, per-device role load/save (persisted map under a new
    `moverse.printerRoles` key), and the routing rule.
  - `Settings.tsx` — the Printer section lists **each** connected printer with its
    model, an "Add another printer" action, per-printer disconnect, and a
    per-printer **role** selector (Item / Box / Any); coverage hints ("No printer
    is set to print item labels"). The box-label Print button routes via the box
    printer; the item test/print via the item printer.
  - `screens/Pack.tsx` — the assign/print item path calls `printerForKind("item")`
    instead of `printer.client`; the "printer not connected" alert becomes
    "no printer for item labels" with the same connect / by-hand recovery.
  - `Settings.tsx` box-label path calls `printerForKind("box")`.
  - `niimbot/label.ts` already renders per size; unchanged. Item vs box render
    choice now follows the **routed printer's** label size/model, not one global
    `labelSize`.
- **Persistence**: new `moverse.printers` (the remembered set) and
  `moverse.printerRoles` (device id → role) AsyncStorage keys, alongside the
  existing `moverse.labelSize` / `moverse.boxExtra`. Migration: an existing single
  remembered printer loads as one entry with role `any`.
- **BLE**: no new dependency; `react-native-ble-plx` already supports multiple
  concurrent peripheral connections. Each managed printer keeps its own
  `BleTransport` + notify subscription.
- **Out of scope**: printing the *same* label to two printers at once; load
  balancing / print queues across printers; more than the two roles (item/box) —
  e.g. a separate "shipping" role — deferred; non-Niimbot vendors (already out of
  scope in `printer-connect-flow`).
