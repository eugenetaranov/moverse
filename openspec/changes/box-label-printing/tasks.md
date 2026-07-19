## 1. Shared box-label print helper

- [ ] 1.1 Add `mobile/src/boxLabelPrint.ts` with `printBoxLabels(code, copies, cbs?)`: load box extra text + QR content, resolve the QR payload, route via `printers.printerForKind("box")` (throw a typed `NoBoxPrinter` when absent), render `renderBoxLabel(code, extra, p.labelSize, p.model.widthPx, qrPayload)`, and print `copies` times.
- [ ] 1.2 Call `onProgress(done, total)` and check `isCancelled()` between copies; stop early on cancel; return `{ printed }`. Cap copies at a max (e.g. 10).
- [ ] 1.3 Refactor Pack's `printBoxLabel` to call the shared helper (single copy) with its existing no-printer recovery.

## 2. BoxDetail: Print label

- [ ] 2.1 Add a "Box label" block to `screens/BoxDetail.tsx`: a copies stepper (1–10, default 1) + a "Print label" button.
- [ ] 2.2 Wire the button to `printBoxLabels(box.boxCode, copies, …)`; show progress ("Printing N of M…") and a success/failure summary; disable/relabel while printing with a Cancel.
- [ ] 2.3 On `NoBoxPrinter`, show the recovery prompt (connect a printer / open Settings to assign a box role / write by hand), mirroring item + packing flows.

## 3. Packing flow consistency

- [ ] 3.1 Ensure the `SetBox` "Print box label" affordance is offered for any set box (new / named / scanned), all going through the shared helper.

## 4. Verify (hardware — user)

- [ ] 4.1 From a box, print 1 copy → one correct label on the box printer.
- [ ] 4.2 Print 3 copies → three identical labels with progress; cancel mid-run leaves the honest count.
- [ ] 4.3 Reprint an older box's label from its detail screen.
- [ ] 4.4 No box printer connected → recovery prompt (not a silent failure).
- [ ] 4.5 A named (free-typed) box prints its code/name correctly.
