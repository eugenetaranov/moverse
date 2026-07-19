## 1. Section delimitation

- [x] 1.1 Wrap each Settings section (printers, print tuning, box labels) in a delimited container — a top divider rule + spacing between blocks (labeling mode stays first, no rule)
- [x] 1.2 Keep `SectionHeader` but ensure the visual boundary no longer relies on the header text alone; printers↔box-labels boundary is now a clear rule
- [x] 1.3 Reused existing `colors.border` for the divider (no new token needed)

## 2. Per-printer log

- [x] 2.1 Tag printer log lines with the device id (`[id] …`) via a per-printer `taggedLog` in the manager, used for each printer's transport + client
- [x] 2.2 Extend the log modal to filter to a device id (prefix-stripped) and title it per printer; combined view unchanged
- [x] 2.3 Add a "View this printer's log" link inside each printer card that opens the modal filtered to that printer; keep the combined log link
- [x] 2.4 `npx tsc --noEmit` clean; commit, push, watch build
