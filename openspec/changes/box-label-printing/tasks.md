## 1. Shared box-label print helper

- [x] 1.1 Add `mobile/src/boxLabelPrint.ts` with `printBoxLabels(code, copies, cbs?)`: load box extra text + QR content, resolve the QR payload, route via `printers.printerForKind("box")` (throw `NoBoxPrinter` when absent), render `renderBoxLabel(code, extra, p.labelSize, p.model.widthPx, qrPayload)`, and print `copies` times.
- [x] 1.2 Call `onProgress(copy, total)` and check `isCancelled()` between copies; stop early on cancel; return `{ printed }`. Cap copies at `MAX_COPIES` (10).
- [x] 1.3 Refactor Pack's `printBoxLabel` to call the shared helper (single copy) with its existing no-printer recovery; removed the now-dead box state/imports from Pack.

## 2. BoxDetail: Print label

- [x] 2.1 Add a "Box label" block to `screens/BoxDetail.tsx`: a copies stepper (1–10, default 1) + a "Print label" button.
- [x] 2.2 Wire the button to `printBoxLabels(boxCode, copies, …)`; show progress ("Printing N of M…"); while printing the button becomes Cancel; report a partial count if cancelled; buzz on success/failure.
- [x] 2.3 On `NoBoxPrinter`, show the recovery prompt (connect & print via a shared `requestBlePerms` + `connectFirstAvailable`, or write by hand), mirroring item + packing flows.

## 3. Packing flow consistency

- [x] 3.1 Packing box printing goes through the shared helper. The `SetBox` "Print box label" affordance stays for a newly-created box (where printing during packing makes sense); reprinting an existing box is handled by BoxDetail (the new on-demand path).

## 4. Verify (hardware — user)

- [ ] 4.1 From a box, print 1 copy → one correct label on the box printer.
- [ ] 4.2 Print 3 copies → three identical labels with progress; cancel mid-run leaves the honest count.
- [ ] 4.3 Reprint an older box's label from its detail screen.
- [ ] 4.4 No box printer connected → recovery prompt (not a silent failure); Connect & print works.
- [ ] 4.5 A named (free-typed) box prints its code/name correctly.
