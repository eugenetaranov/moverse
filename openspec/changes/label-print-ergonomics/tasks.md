## 1. Item reprint

- [x] 1.1 Add a "Print label" action in `screens/ItemDetail.tsx` that reprints `item.itemCode` via `printers.printerForKind("item")` using that printer's label size (reuse `renderLabel`)
- [x] 1.2 Reuse the kind-aware no-printer recovery (connect/assign, or write by hand); no new code is minted
- [x] 1.3 Confirm the post-assign "Print again" affordance stays; wording consistent between the two entry points

## 2. Faster row streaming

- [x] 2.1 Reduce per-row BLE round-trips: image row packets are batched and flushed in one acknowledged MTU-chunked write (kept write-with-response — unpaced no-response drops rows on this hardware; revised from the original "write-without-response" task, see spec note)
- [x] 2.2 Flush the batch when it reaches ~900 bytes and once before `pageEnd`, so several rows ride each acked chunk instead of one round-trip per row
- [x] 2.3 Keep the 6b/7b setup, per-third pixel counts, 255-row repeat cap, and end-of-page status handshake intact
- [x] 2.4 Confirm `testImage.ts` sizes the bitmap to the label (already sized via `labelPx`; width now capped at the printhead)

## 3. Verify

- [ ] 3.1 On hardware: test print prints correctly and noticeably faster; measure against a normal item print of the same size
- [ ] 3.2 Regression: normal item + box labels still print correctly on B1 and D110
- [x] 3.3 `npx tsc --noEmit` clean; commit, push, watch build
