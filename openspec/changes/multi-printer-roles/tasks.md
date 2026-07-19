## 0. Prerequisites (from `printer-connect-flow`)

- [x] 0.1 Confirm `printer-connect-flow` has landed, or pull in its model registry (`niimbot/models.ts` with `detectModel`, per-model `width_px`/`dpi`) and its `scan()` → `connectTo(deviceId)` split — both are prerequisites for the registry and routing below _(printer-connect-flow not landed → pulled in a minimal `niimbot/models.ts` + `detectModel`, `scanPrinters()`/`connectById()` split in transport, and a shared `niimbot/ble.ts` manager)_

## 1. Types and persistence

- [x] 1.1 Add `LabelKind = "item" | "box"` and `PrinterRole = LabelKind | "any"` (in `niimbot/roles.ts` or `labelSettings.ts`)
- [x] 1.2 Add persistence: `moverse.printers` (array of `{ id, name, model }`) and `moverse.printerRoles` (`id -> PrinterRole`) with load/save helpers
- [x] 1.3 Migration: on first load, fold any existing single remembered printer (`moverse.lastPrinter`) into `moverse.printers` as one entry, default role `any`

## 2. PrinterManager (`niimbot/connection.ts`)

- [x] 2.1 Replace the `PrinterConnection` singleton with `PrinterManager` holding `Map<string, ManagedPrinter>` keyed by device id; export `const printers = new PrinterManager()`
- [x] 2.2 `connectNew(deviceId)` — connect and add to the map without touching existing entries; wire each printer's `transport.onDisconnect` to remove only itself and emit
- [x] 2.3 `disconnect(id)` / `forget(id)` — per-printer teardown and removal from remembered set
- [x] 2.4 `list()` and observable `subscribe()` emit on any set change (add / remove / role change)
- [x] 2.5 `setRole(id, role)` — updates the in-memory printer and persists to `moverse.printerRoles`
- [x] 2.6 `reconnectRemembered()` — restore the persisted set in the background on entering settings / before a print; no-op if a connect/print is in flight
- [x] 2.7 Detect and store each printer's model via `detectModel(...)` on connect

## 3. Routing (`niimbot/connection.ts` or `roles.ts`)

- [x] 3.1 `printerForKind(kind: LabelKind): ManagedPrinter | null` — exact-role tier, then `any` tier, deterministic (lowest device id) among ties, else null
- [ ] 3.2 Unit-test the routing table for all five cases in design.md (none / one-any / split roles / both-same / both-any) _(deferred — the project has no test harness yet; routing is small and pure, ready to unit-test once one is added)_

## 4. Settings UI (`Settings.tsx`)

- [x] 4.1 Replace the single printer block with a per-printer list: model + name, connection state, per-printer disconnect
- [x] 4.2 "Add another printer" action → device scan/picker → `connectNew(deviceId)` _(scans and connects the first not-yet-connected device; full multi-candidate picker remains printer-connect-flow's scope)_
- [x] 4.3 Per-printer role selector (Item / Box / Any) calling `setRole`; only surface prominently once ≥2 printers are connected
- [x] 4.4 Coverage hint line: warn when a kind is uncovered or when the assignment is ambiguous (two `any`)
- [x] 4.5 "Print test" targets the printer whose row the button sits in (per-device test)
- [x] 4.6 Box-label printing routes via `printerForKind("box")` _(moved out of Settings per user feedback: printing lives in the add-a-new-box flow, `SetBox` in Pack.tsx; Settings Box-labels only holds the persisted extra text with an explicit Save button)_

## 4b. Per-printer label size + scan feedback

- [x] 4b.1 Add per-model `defaultLabel` to `niimbot/models.ts` (D-series small ≈12×40mm, B1 45×80mm) so a fresh printer prints at the right size
- [x] 4b.2 Persist per-printer label size (`moverse.printerLabels`, id → LabelSize) in `roles.ts`; add `ManagedPrinter.labelSize` + `setLabelSize(id, size)` loaded on connect/reconnect
- [x] 4b.3 Route rendering through the printer's own label size: item/box/test/preview use `printerForKind(kind)?.labelSize` (fixes the D110 image spanning 3 die-cut labels)
- [x] 4b.4 Move label-size editing into each printer card (Width/Height + QR/text indicator); remove the single global "Label size" section
- [x] 4b.5 Cancellable scan: `scanPrinters(..., signal)` + `ScanCancelledError`; `PrinterManager.scanning`/`cancelScan()`; Settings shows a spinner + cancel while searching

## 5. Item print path (`screens/Pack.tsx`)

- [x] 5.1 Replace `printer.client.printImage(...)` with `printers.printerForKind("item")`; render item label at that printer's width/size
- [x] 5.2 On `null`, show the kind-aware recovery alert (connect/assign item printer, use another printer, or write by hand) instead of the old "printer not connected"

## 6. Verification (on hardware: B1 + D11) — user

- [ ] 6.1 Connect B1, then connect D11 without dropping B1; confirm both listed
- [ ] 6.2 Assign B1 → Box labels, D11 → Item labels; add an item → item label prints on D11; print a box label → prints on B1
- [ ] 6.3 Power off D11 mid-session → B1 stays connected; adding an item shows the "no item printer" recovery
- [ ] 6.4 Single-printer regression: with only the B1 (role Any), both item and box labels print with no role config
- [x] 6.6 `npx tsc --noEmit` clean; commit, push, watch the Android build _(tsc clean; committing + building below)_
- [ ] 6.5 Relaunch app → both remembered printers reconnect with their saved roles
