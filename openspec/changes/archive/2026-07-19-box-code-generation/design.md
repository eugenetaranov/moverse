## Context

Item capture already supports two code origins, selected by the onboarding "labeling mode" (`mobile/src/labelingMode.ts`, values `scan | assign | none`):

- **assign** — `reservation.ts` seeds a local counter from `nextCode()` (backend max+1) and hands out `ITM-####` monotonically so the code can be printed/written *before* save. `startAdd()` in `screens/Pack.tsx` reserves, prints via `printer.client.printImage(renderLabel(code, labelSize))` or routes to the `writeCode` screen, then proceeds.
- **none** — no code on device; `handleSave` in `lib/moverse.ts` mints `ITM-####` via `nextItemCode(c)` at save time and always creates.
- **scan** — the user scans a pre-printed `ITM-` label via `Scanner`.

Boxes have none of this. `SetBox` (in `screens/Pack.tsx`) only offers "scan a `BOX-` label" or free-type. `findOrCreateBox(c, boxCode)` looks up `{Box Code}` and creates a stub with whatever string it's given — so a typo or a bare name like "Kitchen" is persisted silently. The backend has `nextItemCode`/`handleNextCode` and the `/next-code` route, but no box equivalent.

This change adds the missing box-code auto-generation, mirroring the item mechanisms as closely as possible so the two flows stay symmetric and maintainable.

## Goals / Non-Goals

**Goals:**
- Parity with items: a box code can be auto-generated (reserved locally for print/write, or minted server-side) or scanned existing.
- Reuse the existing label render + printer path and the existing labeling-mode switch, rather than inventing a parallel mechanism.
- Keep auto-generated codes well-formed (`BOX-####`) so the classifier and duplicate lookup keep working.

**Non-Goals:**
- No change to the item flow, the Airtable data model, or the `Box Code` field.
- No multi-device concurrency guarantees for reservation (single-device assumption holds, same as items — gaps are acceptable).
- No box-detail editing changes (that lives in the browse-inventory change).
- No cross-vendor printer work (owned by printer-connect-flow).

## Decisions

### Mirror `nextItemCode` for boxes rather than generalize

Add `nextBoxCode(c)` and `handleNextBoxCode(c)` in `lib/moverse.ts` that page the Boxes table's `Box Code` field and match `^BOX-(\d+)$`, returning `BOX-${max+1}` zero-padded to 4. This is a near-copy of `nextItemCode`.

- **Why not generalize into one `nextCode(table, field, prefix)` helper?** The two are ~15 lines each; a shared helper would need to thread table/field/prefix/regex and would touch the already-shipped item path. Copying keeps the item code untouched and the diff small and reviewable. A future refactor can unify them if a third code type appears.

Route: `POST /next-box-code` in `api/` + a `vercel.json` rewrite, next to `/next-code`. Guarded identically.

### On-device reservation: a parallel `boxReservation.ts`

Clone `reservation.ts` as `boxReservation.ts` with its own counter, `parse`/`format` on `^BOX-(\d+)$` / `BOX-####`, `seedBoxReservation()` seeding from `nextBoxCode()`, and `reserveBoxCode()`. Same single-device rationale; abandoned reservations leave harmless gaps.

- **Why a separate module, not shared state?** Item and box counters are independent sequences; sharing one counter would interleave the two numbering spaces. Separate modules keep each sequence clean and mirror the file layout reviewers already know.

### `SetBox` gains a "New box" action driven by labeling mode

`SetBox` gets an `onNew` callback. In `Pack.tsx` the handler mirrors `startAdd()`:
- **assign**: `reserveBoxCode()` → if `printer.connected`, print `renderLabel(code, labelSize)` and toast, else route to a new "write on the box" surface → then `applyBox(code)`.
- **none**: set an empty/sentinel box that triggers server-side minting at save. See next decision.
- **scan**: keep the existing "scan a box label" affordance as the primary path; "New box" can be hidden or secondary.

The "Write this on the box" screen parallels the existing item `writeCode` screen (same layout, "box" copy, `renderLabel` already prints the code).

### `none` mode: mint the box code at save time

In `none` mode there is no on-device code, matching items. `handleSave` currently requires `boxCode` (`if (!boxCode) return json({ error: "missing_box" }, 400)`). To support a codeless *new* box, the client signals "new codeless box" (e.g. omit `boxCode` or send an explicit `newBox: true` flag) and `handleSave` mints `BOX-####` via `nextBoxCode(c)` before `findOrCreateBox`/create.

- **Trade-off:** minting at save time means the printed/visible code isn't known until save. That's exactly the item `none`-mode behavior and acceptable for a mode whose whole premise is "no physical labels." Movers who want a visible box code use assign mode.
- Because `none` mode reuses the current box across items (the draft keeps `boxCode`), the box is minted once on the first item's save; subsequent items in the same session reuse the returned code, so the client should capture the minted `boxCode` from the save response and hold it as the current box.

### Keep scan and free-type paths

Scanning a `BOX-` label (`label-scanning` capability) and free-typing a named box are unchanged. Free-type still allows named boxes on purpose (some movers label "Kitchen"); auto-generate is additive, not a replacement.

## Risks / Trade-offs

- **Reservation drift across devices / reinstalls** → seed from server max on each app start (as items do); single-device usage keeps drift to harmless gaps, never collisions with existing records because the server max is authoritative at seed time.
- **`none`-mode minted code not visible until after save** → documented behavior, consistent with item `none` mode; assign mode is the answer for anyone who needs the code up front.
- **Two near-duplicate reservation/next-code code paths** → accepted for review clarity now; flagged as a candidate for a later unify-into-one refactor if a third code type appears.
- **Free-typed non-`BOX-` names still persist as stub boxes** → out of scope to change here; auto-generate gives users a correct-by-construction alternative, reducing how often the free-type path is used for what should be a real box.

## Migration Plan

Additive only — no data migration. Deploy backend (`/next-box-code` + `handleSave` codeless-box path) before shipping the app build that calls it; the new endpoint is inert until the app uses it, and older app builds are unaffected. Rollback is removing the route/flag and the `SetBox` "New box" action; existing boxes and codes are untouched.
