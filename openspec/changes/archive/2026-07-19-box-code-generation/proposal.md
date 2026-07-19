## Why

Item codes have two origins today — the app can **auto-generate** a fresh `ITM-####` (mint it server-side, or reserve one locally to print/write before saving) **or** the user can **scan an existing** `ITM-` sticker. Box codes have neither auto-generation path: in the "Which box?" step you can only scan an existing `BOX-` label or free-type a string. A mover who wants to start a *new* box on the spot has to invent a code by hand (and a typo'd or non-`BOX-` name like "Kitchen" is silently persisted as a stub box), so the box side of the workflow is inconsistent with the item side and error-prone. This change brings boxes to parity with items.

## What Changes

- New backend endpoint **`POST /next-box-code`** that returns the next `BOX-####` (one above the highest numeric `BOX-` code in Airtable), mirroring the existing `/next-code` for items. Non-numeric box codes (e.g. named boxes) are ignored when computing the max.
- The mobile **box-code reservation** counter mirrors the item reservation module: seed from the server max and hand out `BOX-####` monotonically for the print/write-before-save ("assign") flow.
- The **"Which box?" (SetBox)** step gains a **"New box"** action that auto-generates a box code and, honoring the active labeling mode:
  - **assign** — reserves a `BOX-####`, then prints it (if a printer is connected) or shows a "Write this on the box" screen, then sets it as the current box.
  - **none** — mints a `BOX-####` at save time (server-side), no label to print; the box is created on first item save.
  - **scan** — unchanged: the user scans a pre-printed `BOX-` label.
  - Scanning an existing `BOX-` label and free-typing a named box remain available in all modes.
- The label renderer / printer path is reused to print a `BOX-####` label (same mechanism as item labels).

## Capabilities

### New Capabilities
- `box-code-generation`: Auto-generating box codes to parity with items — the `/next-box-code` backend endpoint (max+1 over numeric `BOX-` codes), the on-device box-code reservation counter, and the "New box" flow in the box-assignment step that reserves/mints and prints-or-writes a `BOX-####` label across the scan / assign / none labeling modes, alongside the existing scan-existing and free-type paths.

### Modified Capabilities
<!-- Item code auto-generation (mint / reserve / labeling modes) was built in the MVP but never captured as a formal requirement under openspec/specs/ (the MVP specs describe scanning only), so there is no baseline delta to write; the box behavior is recorded as a new capability that parallels it. `label-scanning` already covers scanning BOX- codes and is unchanged. -->

## Impact

- **Backend** (`lib/moverse.ts` + `api/`): new `nextBoxCode(c)` helper and `handleNextBoxCode` mirroring `nextItemCode`/`handleNextCode`; a new `/next-box-code` route wired in `api/` and `vercel.json`. `handleSave` gains a "codeless box" path (mint a `BOX-####` when a new box has no code) alongside the existing codeless-item minting. Reuses `guard`/`cfg`/Airtable helpers.
- **Mobile** (`mobile/src/`): a `boxReservation.ts` module paralleling `reservation.ts`; an `api.nextBoxCode()` client paralleling `nextCode()`; the `SetBox` component in `screens/Pack.tsx` gains a "New box" action plus a "Write this on the box" surface (paralleling the item `writeCode` screen); reuses `renderLabel` + the printer client.
- **External dependencies**: none new — same Airtable list/create calls and the same Niimbot print path.
- **Data model**: unchanged — reuses the existing Boxes table and `Box Code` field.
