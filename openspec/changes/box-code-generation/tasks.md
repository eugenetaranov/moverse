## 1. Backend: next-box-code endpoint

- [x] 1.1 Add `nextBoxCode(c)` in `lib/moverse.ts` — page the Boxes table `Box Code` field, match `^BOX-(\d+)$`, ignore non-numeric codes, return `BOX-${max+1}` zero-padded to 4 (mirror `nextItemCode`).
- [x] 1.2 Add `handleNextBoxCode(c)` returning `{ nextBoxCode }` (mirror `handleNextCode`).
- [x] 1.3 Add the `/next-box-code` handler in `api/` and the rewrite in `vercel.json`, guarded identically to `/next-code`.
- [ ] 1.4 Verify `POST /next-box-code` returns `BOX-0001` on an empty table, max+1 otherwise, ignores named boxes, and 401s without the app secret.

## 2. Backend: codeless new box on save (none mode)

- [x] 2.1 In `handleSave`, add a "new codeless box" path: when the client signals a new box with no code (`newBox: true` + omitted `boxCode`), mint `BOX-####` via `nextBoxCode(c)` before `findOrCreateBox`.
- [x] 2.2 Return the (effective) `boxCode` in the save response so the client can hold it as the current box for subsequent items.
- [ ] 2.3 Verify saving an item in "none" mode to a new box creates a `BOX-####` box and reuses it for the next item in the same session.

## 3. Mobile: box-code reservation + API client

- [x] 3.1 Add `api.nextBoxCode()` in `mobile/src/api.ts` calling `POST /next-box-code` (mirror `nextCode`).
- [x] 3.2 Add `mobile/src/boxReservation.ts` with `seedBoxReservation()` and `reserveBoxCode()` over `^BOX-(\d+)$` / `BOX-####` (mirror `reservation.ts`), seeding from `api.nextBoxCode()`.
- [x] 3.3 Seed the box reservation at app start alongside the item reservation seed.

## 4. Mobile: "New box" flow in SetBox

- [x] 4.1 Add an `onNew` callback to the `SetBox` component and a "New box" action in its UI (alongside scan + free-type).
- [x] 4.2 In `Pack.tsx`, implement `startNewBox` mirroring `startAdd()`: assign mode → `reserveBoxCode()`, print via `printBoxLabel(code)` if a box printer is connected else route to the "write on the box" screen, then set as current box.
- [x] 4.3 Add a `writeBox` screen paralleling the item `writeCode` screen ("Write this on the box", big code, Done/Cancel).
- [x] 4.4 Handle "none" mode in `startNewBox`: set a new codeless box (`newBox: true`) rather than reserving a code; capture the minted `boxCode` from the save response as the current box.
- [x] 4.5 In "scan" mode keep scan-a-box-label as the primary path; "New box" is hidden (`onNew` omitted).

## 5. Verification

- [ ] 5.1 Assign mode + printer: "New box" reserves the next `BOX-####`, prints the label, sets it as the current box.
- [ ] 5.2 Assign mode, no printer: "New box" shows the write-on-the-box screen with the code and sets it on confirm.
- [ ] 5.3 None mode: new box is minted server-side at first save and reused across items in the session.
- [ ] 5.4 Scanning an existing `BOX-` label and free-typing a named box still work unchanged.
- [ ] 5.5 Auto-generated codes classify as box labels and round-trip as the stored `Box Code`.
