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

**3. Non-blocking print status; Save never gated on printing.** Reuse the existing `printStatus` states and surface them as one status line: `Printing… → Printed`, `No printer — will print when connected [Connect]`, `Print failed — Retry`. Save is gated only on a photo, never on print success. Rationale: a disconnected Bluetooth printer must not wall off the core task; the critique rated this a blocker in the current mid-flow model.

**4. Mode-aware code step (single swap point).** The code row is the only mode-variant part of the sheet: `assign` → mint+print on open; `scan` → live scan step (reuse `Scanner.tsx`/`Capture.tsx` scan) with a manual `TextField` fallback, no printing; `none` → row omitted, server mints hidden code at save (`itemCode` undefined in `api.save`). Rationale: the three modes change the *shape* of the flow (output-at-end vs input-near-start vs absent); isolating the variation to one row keeps photo/description/Save identical across modes.

**5. Box is a persistent, preselected chip.** The current target box is preselected to the previous box and **persisted across app restarts** (new persistence — today the draft box is in-memory only). Shown as a one-tap chip both on the idle screen and at the top of the sheet; tapping opens the existing box picker (`SetBox`). Rationale: many-items-into-same-box is the dominant case; burying box selection as a required step taxes the common path, while a glanceable chip preserves the error-prevention value of "which box am I filling."

**6. Photo-gated Save + same-box loop.** `Save item` is disabled until ≥1 photo exists (label: "Add a photo to save"). After a successful save the sheet resets to a fresh item in the same box with the next label already printing (extends today's `doSave` reset that already retains `boxCode`). A `Done`/close exits to idle. Rationale: prevents accidental blank items in the fast loop, and makes the single entry-tap cost amortize across a whole packing session.

**7. Reprint relocates to idle recent-items + item detail.** The reprint icon leaves the capture surface. The idle screen gains a recent-items list (from `inventory.ts`) whose rows offer reprint (reusing `itemLabelPrint.ts`, existing code, no new mint) and open item detail. Item detail already supports reprint.

## Risks / Trade-offs

- **Wasted label/code on abandonment (from print-on-open)** → Accept as cheaper than an extra tap per item. On discard with only an auto-printed label and no human input, close silently; reclaim/void the reserved code per the existing reservation flow if supported, otherwise tolerate a sequence gap as today.
- **First item of a session / after restart has no "previous box"** → Persist current box across restarts; on genuine first-run with zero boxes, the round button becomes "Create first box" and the capture flow is unreachable until a box exists.
- **Round FAB reads as a "secondary add" affordance** → Mitigated by making it the sole, centered, prominent action on an otherwise minimal screen (user chose this over a full-width bar).
- **Accidental Save in the fast loop** → Photo-gated Save neutralizes blank items; success flash + `Done` keep the loop escapable.
- **Hiding fields behind the sheet could add taps** → Mitigated by the same-box loop (entry tap is once per session, not per item) and by opening the sheet camera-forward.
