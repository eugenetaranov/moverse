## Context

`mobile/src/screens/Pack.tsx` is a single self-contained state machine (a local `screen` state swaps between full-screen "surfaces" and a "home hub"). The home hub currently renders the box banner, photo tile, item-code area ("Assign & print" / reprint), description field, and a bottom action bar that flips between "Add item" and "Save" — all at once. Item drafts live in a single `Draft` object; `mode` (`assign` | `scan` | `none`, from `labelingMode.ts`) branches how the code area renders. Printing is Bluetooth (Niimbot) via `printLabel` / `itemLabelPrint.ts`; codes are minted through `reservation.ts` (`ITM-####`) and `boxReservation.ts` (`BOX-####`). Save calls `api.save`.

This redesign was shaped by a UX consultation. Two decisions were made by the user: (1) the label prints **on flow open** (peel-and-stick workflow, matching today's behavior); (2) the idle entry point is a **big round centered button**. The remaining design follows the consensus of the design + critique passes.

## Goals / Non-Goals

**Goals:**
- Collapse the cluttered always-visible hub into a minimal idle screen + one round "New item" button.
- Demote code/print/box handling to automatic, non-blocking status — never competing buttons.
- Keep the high-repetition rhythm fast: one tap to enter, then photo → Save → loop, staying in the same box.
- Work correctly across all three labeling modes and never block the task on printer hardware.

**Non-Goals:**
- No backend/API changes: `/save`, `/next-code`, `/describe`, and the print path are reused as-is.
- No change to code-minting or label-rendering logic, printer routing, or the AI describe endpoint.
- Not redesigning box creation/box-label printing (that flow already exists via `SetBox`).
- Not changing item detail / browse screens beyond confirming reprint lives there.

## Decisions

**1. One auto-advancing sheet, not a multi-step wizard.** The capture flow opens as a single full-height sheet with a scrollable column where box + code are pre-handled and the human steps (photo, optional description, Save) are focused. Rationale: a wizard adds a Next-tap per step to a task done dozens of times per session; the critique flagged tap-count as the main regression risk. Keeping everything on one reachable surface preserves the "always-visible fields" speed the current hub has, while removing its clutter. Implemented by keeping Pack's existing `screen` state machine — the sheet is a new composite surface rather than the hub.

**2. Print-on-open (user decision).** In `assign` mode, opening the sheet mints the code and fires `printLabel` immediately, so the label can be peeled and stuck before photographing. Alternative considered — print-on-save — avoids wasting a label/code on abandonment but delivers the label after the item is already handled, which breaks the physical peel-then-pack sequence. Trade-off accepted: a discarded item may waste one sticker (see Risks).

**3. Mode-dependent print gating.** Reuse the existing `printStatus` states and surface them as one status line: `Printing… → Printed ✓`, `No printer — connect to print [Connect]`, `Print failed — connect or retry [Retry]`. Gating depends on the labeling mode (the "flow" chosen in Settings): in `assign` mode the physical sticker is the point, so a printer problem is a **blocker** — Save waits until the label prints or the user taps "write the code by hand" to acknowledge (so a dead printer isn't a dead end). In `scan`/`none` modes nothing prints, so print state never gates Save. Rationale: saving an assign-mode item whose label never printed produces inventory with no sticker, which defeats the workflow; the hand-write escape preserves recoverability.

**4. Mode-aware code step (single swap point).** The code row is the only mode-variant part of the sheet: `assign` → mint+print on open; `scan` → live scan step (reuse `Scanner.tsx`/`Capture.tsx` scan) with a manual `TextField` fallback, no printing; `none` → row omitted, server mints hidden code at save (`itemCode` undefined in `api.save`). Rationale: the three modes change the *shape* of the flow (output-at-end vs input-near-start vs absent); isolating the variation to one row keeps photo/description/Save identical across modes.

**5. Box is a persistent, preselected chip.** The current target box is preselected to the previous box and **persisted across app restarts** (new persistence — today the draft box is in-memory only). Shown as a one-tap chip both on the idle screen and at the top of the sheet; tapping opens the existing box picker (`SetBox`). Rationale: many-items-into-same-box is the dominant case; burying box selection as a required step taxes the common path, while a glanceable chip preserves the error-prevention value of "which box am I filling."

**6. Save gating + same-box loop.** `Save item` is gated only on a box (and, unless in none mode, a valid item code); photo and description are both optional (product decision — keep the loop fast and don't block on a photo). After a successful save the sheet resets to a fresh item in the same box with the next label already printing (extends today's `doSave` reset that already retains `boxCode`). A `Done`/close exits to idle. The same-box loop makes the single entry-tap cost amortize across a whole packing session.

**7. Reprint relocates to idle recent-items + item detail.** The reprint icon leaves the capture surface. The idle screen gains a recent-items list (from `inventory.ts`) whose rows offer reprint (reusing `itemLabelPrint.ts`, existing code, no new mint) and open item detail. Item detail already supports reprint.

## Risks / Trade-offs

- **Wasted label/code on abandonment (from print-on-open)** → Accept the wasted sticker as cheaper than an extra tap per item. The reserved item *number* is reclaimed on discard (`releaseCode` hands the last-minted code back to the counter), so discarding `ITM-0068` leaves the next item as `ITM-0068` rather than skipping to `0069` — no gap in the sequence. On discard with only an auto-printed label and no human input, close silently.
- **First item of a session / after restart has no "previous box"** → Persist current box across restarts; on genuine first-run with zero boxes, the round button becomes "Create first box" and the capture flow is unreachable until a box exists.
- **Round FAB reads as a "secondary add" affordance** → Mitigated by making it the sole, centered, prominent action on an otherwise minimal screen (user chose this over a full-width bar).
- **Blank items in the fast loop (photo + description both optional)** → Accepted for speed; in assign/scan modes the item still carries a code, so it isn't truly empty. In `none` mode a box-only item is possible — tolerated as the cost of a frictionless loop; success flash + `Done` keep the loop escapable.
- **Assign-mode item saved with no printed sticker** → Prevented: Save is gated on the label being printed or explicitly hand-written in assign mode.
- **Hiding fields behind the sheet could add taps** → Mitigated by the same-box loop (entry tap is once per session, not per item) and by opening the sheet camera-forward.
