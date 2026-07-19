# Design — box-label printing (on demand, one or more)

## Entry points

Box-label printing should be reachable wherever the user thinks "this box needs a
label":

1. **From the box (BoxDetail)** — the new primary entry point. Look at a box in the
   inventory, tap **Print label**, choose copies, print. This is the reprint / label-
   more-faces path.
2. **During packing (SetBox)** — the existing path, kept: when you set/create the
   current box, you can print its label right then. Unified to the same helper so it
   behaves identically (including copies, if surfaced there).

Both call **one shared helper** so routing, rendering, recovery, and copies are
identical. Today Pack owns `printBoxLabel`; BoxDetail lives in the Browse stack and
can't reuse Pack's local function — hence the extraction.

## The shared helper

```ts
// boxLabelPrint.ts
async function printBoxLabels(
  code: string,
  copies: number,
  cbs?: { onProgress?: (done: number, total: number) => void; isCancelled?: () => boolean },
): Promise<{ printed: number }>
```

Responsibilities (all the logic that must not diverge between entry points):
- Load the box **extra text** + **QR content** setting; resolve the QR payload
  (`resolveBoxQrPayload`).
- Resolve the **box printer** via `printers.printerForKind("box")`. If none →
  throw a typed `NoBoxPrinter` error the caller turns into the recovery prompt.
- Render `renderBoxLabel(code, extra, printer.labelSize, printer.model.widthPx,
  qrPayload)` — at the box printer's size/width (same width-cap fix as items).
- Print the label **`copies` times**, calling `onProgress(i, copies)` and checking
  `isCancelled()` between copies; stop early on cancel; surface a per-print failure.

Callers own the UI (stepper, progress text, alerts) and the recovery choices; the
helper owns the mechanism.

## Copies: repeat the single-label print

Print N copies by **looping the proven single-label print**, not by using the
protocol's page-copies field.

- **Why loop, not protocol copies?** The single-label path is hardware-verified and
  now has the write-timeout / pacing / cancel safety. The protocol `copies` field
  (`setPageSize6b`) and multi-page `printStart7b` are less tested per-model and were
  the source of the early "3 blank pages" bug. Looping keeps each copy self-contained
  and cancellable, at the cost of a small per-copy setup overhead — acceptable for the
  handful of copies a user prints.
- **Cap**: copies limited to a sane max (e.g. **10**) via a stepper; the default is
  **1** so the common case is unchanged.
- **Cancel**: checked between copies; a cancel after copy 2 of 5 leaves 2 printed and
  stops — reported honestly ("Printed 2 of 5").

## "Generate" = render, not mint

"Generate and print a label" means **render** the box's label image and print it. No
new code is created — the box already has a code (`BOX-####`, or a free-typed name).
The QR encodes whatever the box-QR setting resolves for that code; a named box prints
its name as text and in the QR. Minting box codes is `box-code-generation` (shipped)
and stays out of this change.

## BoxDetail UI

A "Box label" block in the header:
- A **copies stepper** (− N +), 1–10, default 1.
- A **Print label** button (routes to the box printer). While printing it shows
  progress ("Printing 2 of 3…") and offers **Cancel**.
- When no box printer is connected: the standard recovery — connect a printer, open
  Settings to assign a box role, or write the code by hand — mirroring the item and
  packing flows, so behavior is consistent.

## Consistency with existing flows

- Same **routing** (`printerForKind("box")`), **rendering** (`renderBoxLabel` at the
  printer's size/width), **QR content** (box-QR setting), and **recovery** as the
  packing flow — this change centralizes them rather than adding a parallel path.
- Reuses the item-reprint interaction shape (a print button on the detail screen)
  so items and boxes feel the same.
