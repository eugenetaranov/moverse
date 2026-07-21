## Why

The Pack "home hub" shows every control at once — box banner, photo tile, an "Assign & print" button, a reprint icon, a description field, and a bottom button that flips between "Add item" and "Save". These overlap in purpose and compete for attention, so it is unclear which control starts a new item. For a task the user repeats dozens of times per session, the clutter slows the rhythm and invites mistakes.

## What Changes

- **BREAKING** Replace the always-visible capture hub with a minimal idle screen: a current-box chip, a recent-items list (for reprint/edit), and one big round centered **New item** button.
- Tapping **New item** opens a single full-height capture sheet (auto-advancing, not a multi-step wizard): preselected box chip → auto label handling → photo → optional description → **Save item**.
- In `assign` mode the item code is minted and the label is **printed on sheet open** (peel-and-stick workflow), surfaced as a non-blocking status line (Printing… / Printed / No printer — will print when connected / Print failed — Retry). Printing never blocks Save.
- `Save item` is pinned full-width at the bottom and is disabled until at least one photo exists.
- After Save, the sheet loops straight back to a fresh item in the **same box**, with the next label already printing. A Done/close control exits to the idle screen.
- The flow adapts to all three labeling modes: `assign` (auto mint + print), `scan` (the code line becomes a live Scan-sticker step with manual-entry fallback, no printing), `none` (no code line at all; the server mints a hidden code at save).
- Reprint moves off the capture screen onto the idle recent-items list and item detail.
- Edge cases: no printer (queue/defer, never block), print failure (retry line), first-run with no boxes (the round button becomes "Create first box"), and a discard confirmation when backing out with real input entered.

## Capabilities

### New Capabilities
- `item-capture-entry`: The Pack idle screen — the round "New item" entry point, current-box chip, recent-items list as the reprint/edit surface, and the first-run "Create first box" state.

### Modified Capabilities
- `item-capture`: The capture workflow changes from an always-visible linear form to a single auto-advancing sheet with print-on-open label handling, photo-gated Save, a same-box loop after Save, and mode-aware code handling for assign/scan/none.
- `item-label-reprint`: Reprint is removed from the capture surface; the reprint entry points become the idle recent-items list and item detail.

## Impact

- `mobile/src/screens/Pack.tsx` — primary rewrite of the idle hub and capture flow (state machine, screen surfaces, action bar).
- Reuses existing helpers: `reservation.ts` / `boxReservation.ts` (code minting), `itemLabelPrint.ts` + `printLabel` (printing), `api.save` / `describe` (persistence + AI description), `inventory.ts` (box/recent-item loading), `Capture.tsx` (camera), `Scanner.tsx` (scan mode).
- `labelingMode.ts` continues to drive which code step renders; no backend/API changes expected — `/save`, `/next-code`, `/describe`, and the print path are reused as-is.
