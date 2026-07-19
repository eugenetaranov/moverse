## Why

Box labels can only be printed **during packing**, in the "Which box?" (SetBox)
step, and only for the box you're setting right then: the "New box" action
auto-prints, a freshly-typed code shows a "Print box label" button, and
scanned/named boxes get nothing. There is no way to **(re)print a box's label
later**, and no way to print **more than one copy**. Both are real needs in a move:

- A packed box needs its code on **several faces** so it's readable however the box
  is stacked — that means printing the *same* label 2–4 times.
- Labels get scuffed, torn, or covered by tape and need a **reprint**, long after
  the box was first set.
- You often decide to label a box *from the box itself* (looking at what's in it in
  the inventory), not mid-scan during packing.

Item labels already reprint on demand from the item's detail screen; boxes should
have the same, plus a copies count.

## What Changes

- **Print a box's label from its detail screen.** `BoxDetail` gains a **Print
  label** action that renders that box's label (its code + QR/text per the box-QR
  setting + the saved extra text) at the **box printer's** size and prints it,
  routed via `printerForKind("box")` with the same **no-printer recovery**
  (connect / write by hand) used everywhere else. No new code is minted — the box's
  existing code is used (a named box prints its name/code just the same).
- **Print one or more copies.** A small **copies** control (stepper, default 1) lets
  the user print N identical labels in one action, with per-copy progress
  ("Printing 2 of 3…") and the ability to cancel between copies.
- **One coherent add-and-print path.** The packing flow and BoxDetail share a single
  box-label print helper, so routing, rendering, recovery, and copies behave
  identically everywhere. The "Print label" affordance is offered consistently for
  any box that's set in packing — new, named, or scanned — not only a freshly-typed
  code.

## Capabilities

### New Capabilities
- `box-label-printing`: On-demand box-label printing — from the box's detail screen
  and the packing flow — of one or more copies, routed to the box printer, rendered
  at that printer's size/width with the configured QR content + extra text, with the
  standard no-printer recovery and cancel-between-copies. A shared print helper backs
  both entry points.

### Modified Capabilities
<!-- The box-label render/content model (`box-label-content`) and box-code
generation (`box-code-generation`) already shipped and are unchanged; this change
only adds new entry points, a copies count, and a shared print path. -->

## Impact

- **Mobile app** (`mobile/src/`):
  - New shared helper (e.g. `boxLabelPrint.ts`): `printBoxLabels(code, copies, cbs)`
    — loads the box extra text + QR content, resolves the QR payload, routes via
    `printers.printerForKind("box")`, renders `renderBoxLabel` at the box printer's
    size/width, and prints N times with progress + cancel + no-printer recovery.
    Pack's current `printBoxLabel` is refactored to call it.
  - `screens/BoxDetail.tsx`: a "Print label" section — a copies stepper (1–N) + a
    Print button, progress feedback, and the no-printer recovery (connect / write by
    hand / open Settings). Available in the Browse stack.
  - `screens/Pack.tsx`: the packing box-print path calls the shared helper; the
    "Print box label" affordance in `SetBox` is available for any set box.
- **Print path**: copies are printed by repeating the proven single-label print (each
  copy self-contained, honoring the write-timeout/cancel safety), capped at a sane
  max; no protocol change required.
- **Out of scope**: bulk-printing labels for *many boxes at once* from the Browse
  list (possible follow-up); changing the QR-content model (owned by
  `box-label-content`); item-label copies; any new code generation (owned by
  `box-code-generation`).
