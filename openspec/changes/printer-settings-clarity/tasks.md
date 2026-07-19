## 1. Section delimitation

- [ ] 1.1 Wrap each Settings section (labeling mode, printers, print tuning, box labels) in a delimited container — its own surface/card with spacing and/or a divider between blocks
- [ ] 1.2 Keep `SectionHeader` but ensure the visual boundary no longer relies on the header text alone; verify printers↔box-labels boundary is obvious
- [ ] 1.3 Add a divider token to `theme.ts` only if an existing surface/border token doesn't suffice

## 2. Per-printer log

- [ ] 2.1 Tag printer log lines with the device id / name so lines can be attributed to a printer (in the `printers.log` sink or line format)
- [ ] 2.2 Extend the log modal to accept an optional device filter and show only that printer's lines
- [ ] 2.3 Add a "View log" link inside each printer card that opens the modal filtered to that printer; keep the global log link
- [ ] 2.4 `npx tsc --noEmit` clean; visual check on device; commit, push, watch build
