## 1. Item reprint

- [ ] 1.1 Add a "Print label" action in `screens/ItemDetail.tsx` that reprints `item.itemCode` via `printers.printerForKind("item")` using that printer's label size (reuse `renderLabel`)
- [ ] 1.2 Reuse the kind-aware no-printer recovery (connect/assign, or write by hand); no new code is minted
- [ ] 1.3 Confirm the post-assign "Print again" affordance stays; wording consistent between the two entry points

## 2. Faster row streaming

- [ ] 2.1 Change `client.ts` `write()`/`ackMode` so image rows use write-without-response instead of an acknowledged write per chunk
- [ ] 2.2 Add periodic flow-control pacing: a check-line / status sync every N rows (and once before pageEnd) to keep the printer's buffer from overrunning, instead of per-chunk acks
- [ ] 2.3 Keep the 6b/7b setup, per-third pixel counts, 255-row repeat cap, and end-of-page status handshake intact; review the poll `sleep(250)` / inter-op delays
- [ ] 2.4 Confirm `testImage.ts` sizes the bitmap to the label (no oversized fixed dimensions)

## 3. Verify

- [ ] 3.1 On hardware: test print prints correctly and noticeably faster; measure against a normal item print of the same size
- [ ] 3.2 Regression: normal item + box labels still print correctly on B1 and D110
- [ ] 3.3 `npx tsc --noEmit` clean; commit, push, watch build
