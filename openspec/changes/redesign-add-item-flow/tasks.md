## 1. Persist current box

- [x] 1.1 Add persistence for the current target box (AsyncStorage `currentBox.ts`), written whenever the box changes and after each save
- [x] 1.2 On Pack mount, seed the draft/current box from persisted value (fall back to no-box when none)

## 2. Idle screen

- [x] 2.1 Replace the always-visible hub with a minimal idle layout: current-box chip, recent-items list, round "New item" button
- [x] 2.2 Build the round centered "New item" button (thumb-zone placement); switches to "Create first box" when no boxes exist
- [x] 2.3 Current-box chip shows the active box and opens the box picker (`SetBox`) on tap
- [x] 2.4 Recent-items list (session-recent): show items packed this session with an inline reprint action (reuse `itemLabelPrint.ts`, existing code); reprint hidden in `none` mode. (Editing stays in Browse item-detail — no cross-tab deep link.)
- [x] 2.5 First-run: when no boxes exist, the primary action starts box creation instead of opening the capture flow

## 3. Capture sheet shell

- [x] 3.1 Add a full-height capture sheet surface to Pack (`flowOpen`), opened by "New item"
- [x] 3.2 Sheet header: preselected box chip (one-tap change via `SetBox`) + Done/close control
- [x] 3.3 Camera-forward photo step (reuse `Capture.tsx`): big "Take photo" tile when empty; once photos exist, a horizontal strip (constant height as the empty tile) of thumbnails each with a ✕ delete badge and a ＋ "Add" tile. The strip auto-scrolls to the end as photos are added so the ＋ stays visible with the previous photo peeking on the left. On save, the first photo goes via `api.save` and extras are appended with `addItemPhoto` (best-effort).
- [x] 3.4 Optional description field with inline "Auto-describe" (reuse `describe`); never blocks Save
- [x] 3.5 Full-width "Save item" pinned at the bottom; photo and description optional, gated only on a box (+ valid code unless none mode)

## 4. Mode-aware code step

- [x] 4.1 `assign`: on sheet open, mint code (`reservation.ts`) and fire `printLabel`; render the non-blocking status line
- [x] 4.2 Status line states: Printing… / Printed ✓ / "No printer — connect" [Connect] / "Print failed" [Retry] + "write by hand" link; in assign mode these gate Save (printer problem is a blocker) until printed or hand-written acknowledged
- [x] 4.3 `scan`: the code line is a code field + live scan step (`Scanner.tsx`) with manual-entry fallback; no printing
- [x] 4.4 `none`: omit the code line entirely; save with `itemCode` undefined so the server mints the hidden code

## 5. Save, loop, and exit

- [x] 5.1 On Save, call `api.save` with box/code/description/photo; on success show the success flash
- [x] 5.2 After success, reset to a fresh item in the same box and, in `assign` mode, start the next label print
- [x] 5.3 Save-failure path keeps photo/description/box/code and allows retry
- [x] 5.4 Done/close exits to idle; discard confirmation when backing out after real input (photo taken or description typed); silent close when only an auto-printed label exists

## 6. Cleanup and verification

- [x] 6.1 Remove the old hub controls: photo tile, "Assign & print" pill, reprint icon, and the "Add item"/"Save" dual action bar; remove the standalone label/write-code/capture surfaces and QR preview
- [x] 6.2 Confirm reprint is reachable only from recent-items and item detail (removed from the capture surface)
- [ ] 6.3 Manually verify all three modes end to end (assign/scan/none), including no-printer, print-failure, first-run-no-box, and discard-confirm paths
- [x] 6.4 Typecheck `mobile/` (tsc --noEmit) — passes clean
