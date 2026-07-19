## 0. Prerequisites (from `printer-connect-flow`)

- [ ] 0.1 Confirm `printer-connect-flow` has landed, or pull in its model registry (`niimbot/models.ts` with `detectModel`, per-model `width_px`/`dpi`) and its `scan()` → `connectTo(deviceId)` split — both are prerequisites for the registry and routing below

## 1. Types and persistence

- [ ] 1.1 Add `LabelKind = "item" | "box"` and `PrinterRole = LabelKind | "any"` (in `niimbot/roles.ts` or `labelSettings.ts`)
- [ ] 1.2 Add persistence: `moverse.printers` (array of `{ id, name, model }`) and `moverse.printerRoles` (`id -> PrinterRole`) with load/save helpers
- [ ] 1.3 Migration: on first load, fold any existing single remembered printer (`moverse.lastPrinter`) into `moverse.printers` as one entry, default role `any`

## 2. PrinterManager (`niimbot/connection.ts`)

- [ ] 2.1 Replace the `PrinterConnection` singleton with `PrinterManager` holding `Map<string, ManagedPrinter>` keyed by device id; export `const printers = new PrinterManager()`
- [ ] 2.2 `connectNew(deviceId)` — connect and add to the map without touching existing entries; wire each printer's `transport.onDisconnect` to remove only itself and emit
- [ ] 2.3 `disconnect(id)` / `forget(id)` — per-printer teardown and removal from remembered set
- [ ] 2.4 `list()` and observable `subscribe()` emit on any set change (add / remove / role change)
- [ ] 2.5 `setRole(id, role)` — updates the in-memory printer and persists to `moverse.printerRoles`
- [ ] 2.6 `reconnectRemembered()` — restore the persisted set in the background on entering settings / before a print; no-op if a connect/print is in flight
- [ ] 2.7 Detect and store each printer's model via `detectModel(...)` on connect

## 3. Routing (`niimbot/connection.ts` or `roles.ts`)

- [ ] 3.1 `printerForKind(kind: LabelKind): ManagedPrinter | null` — exact-role tier, then `any` tier, deterministic (lowest device id) among ties, else null
- [ ] 3.2 Unit-test the routing table for all five cases in design.md (none / one-any / split roles / both-same / both-any)

## 4. Settings UI (`Settings.tsx`)

- [ ] 4.1 Replace the single printer block with a per-printer list: model + name, connection state, per-printer disconnect
- [ ] 4.2 "Add another printer" action → device scan/picker (`printer-connect-flow`) → `connectNew(deviceId)`
- [ ] 4.3 Per-printer role selector (Item / Box / Any) calling `setRole`; only surface prominently once ≥2 printers are connected
- [ ] 4.4 Coverage hint line: warn when a kind is uncovered or when the assignment is ambiguous (two `any`)
- [ ] 4.5 "Print test" targets the printer whose row the button sits in (per-device test)
- [ ] 4.6 Box-label Print button routes via `printerForKind("box")`; render box label at that printer's width/size

## 5. Item print path (`screens/Pack.tsx`)

- [ ] 5.1 Replace `printer.client.printImage(...)` with `printers.printerForKind("item")`; render item label at that printer's width/size
- [ ] 5.2 On `null`, show the kind-aware recovery alert (connect/assign item printer, use another printer, or write by hand) instead of the old "printer not connected"

## 6. Verification (on hardware: B1 + D11)

- [ ] 6.1 Connect B1, then connect D11 without dropping B1; confirm both listed
- [ ] 6.2 Assign B1 → Box labels, D11 → Item labels; add an item → item label prints on D11; print a box label → prints on B1
- [ ] 6.3 Power off D11 mid-session → B1 stays connected; adding an item shows the "no item printer" recovery
- [ ] 6.4 Single-printer regression: with only the B1 (role Any), both item and box labels print with no role config
- [ ] 6.5 Relaunch app → both remembered printers reconnect with their saved roles
- [ ] 6.6 `npx tsc --noEmit` clean; commit, push, watch the Android build
