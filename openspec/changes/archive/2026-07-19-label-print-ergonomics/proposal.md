## Why

Two rough edges in day-to-day label printing:

1. **Reprinting an item label is awkward.** A label can jam, misfeed, peel badly, or
   just get lost. Right now a fresh reprint is easy only on the assign/label screen
   right after a code is generated; once the item is saved and you're in its detail
   view, there's no way to print another label for that same item without recreating
   it. Reprinting the *existing* code should be one tap wherever the item is shown.
2. **Test print is slow — much slower than a normal item print.** Image rows are
   streamed as BLE **write-with-response** (an acknowledged round-trip per ~20-byte
   chunk). A test pattern is a dense, full-label bitmap with few mergeable empty
   rows, so it pays that ack cost on almost every row and crawls, while a sparse
   text item label flies. The acknowledged-write path was added for delivery
   reliability during bring-up; now that printing is proven, it's worth making the
   row stream fast without regressing reliability.

## What Changes

- **Item reprint anywhere the item is shown.** A "Print label" / "Print again"
  action reprints the item's existing code (routed to the item printer, same
  recovery when none is connected) from the item detail view — not only the
  post-assign label screen. No new code is minted; the current code is reused.
- **Faster printing.** Rework the image-row stream so it isn't gated on a
  per-chunk BLE acknowledgement: use write-without-response with periodic
  flow-control/check-line pacing (a sync every N rows) instead of an ack on every
  chunk, and confirm the test image is no larger than the label needs. The result:
  a test print completes in time comparable to a normal item print of the same
  label size, with no loss of print correctness.

## Capabilities

### New Capabilities
- `item-label-reprint`: Reprinting an existing item's label (reusing its current
  code, routed by kind, with the standard no-printer recovery) from the item's
  detail view, in addition to the post-assign screen.
- `print-performance`: The throughput of the image-row stream — replacing the
  per-chunk acknowledged write with paced write-without-response plus a periodic
  flow-control sync, so dense labels (test prints) print quickly while staying
  correct.

## Impact

- **Mobile app** (`mobile/src/`):
  - `screens/ItemDetail.tsx` — add a "Print label" action that reprints
    `item.itemCode` via `printers.printerForKind("item")` with the kind-aware
    recovery (reuse the existing render + routing; no new code).
  - `niimbot/client.ts` — change `printImage`'s row-write path (`write()` /
    `ackMode`) from write-with-response-per-chunk to write-without-response with a
    check-line / status sync every N rows for flow control; keep the correct
    6b/7b sequence, per-third counts, and the 255-row repeat cap. Review the poll
    `sleep(250)` and inter-op delays.
  - `niimbot/testImage.ts` — confirm the test bitmap is sized to the label and not
    larger than necessary.
- **Out of scope**: reprinting box labels from box detail (can follow the same
  pattern later); batch/reprint-multiple; changing the label artwork; the
  cross-printer routing rules (already defined).
