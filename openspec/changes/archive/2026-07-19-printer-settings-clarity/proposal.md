## Why

The Settings screen has grown several stacked sections — labeling mode, one card
per connected printer, "Add another printer", print tuning, box labels — rendered as
a flat list of `SectionHeader` + controls on one background. There is no visual
break between them, so it is hard to tell where the **printer** settings end and the
**box labels** section begins; everything reads as one long column. Separately, the
printer diagnostics log is a single global "View printer log" link, but with more
than one printer connected the log interleaves every printer's traffic and there is
no way to see just one printer's activity — which is exactly what you want when one
printer misbehaves and the other is fine.

## What Changes

- **Sections become visually distinct.** Each top-level Settings section (labeling
  mode, printers, print tuning, box labels) is a clearly delimited block — grouped
  on its own surface/card with spacing (and/or a divider) between blocks — so the
  boundary between, e.g., the printers area and the box-labels area is obvious at a
  glance. Section headers stay, but the grouping no longer relies on the header text
  alone.
- **Each printer card gets its own log link.** Alongside (or replacing) the single
  global log link, every connected printer's card exposes a "View log" affordance
  that opens the diagnostics filtered to that printer's traffic, so a two-printer
  setup can be diagnosed per device. The global log remains available.

This is a presentation/organization change; it does not alter what any setting does.

## Capabilities

### New Capabilities
- `printer-settings-ui`: The visual structure of the Settings screen — distinct,
  delimited sections with clear boundaries between printer settings and box-label
  settings — and per-printer access to that printer's own diagnostics log in
  addition to the global log.

## Impact

- **Mobile app** (`mobile/src/`):
  - `Settings.tsx` — wrap each section in a delimited container (surface + spacing /
    divider); add a per-printer "View log" link inside each printer card; the log
    modal accepts an optional device-id filter so it can show one printer's lines.
  - Printer traffic in the log is tagged per device so the modal can filter it
    (the `printers.log` sink or the line format carries the device id / name).
  - `theme.ts` — reuse existing surface/border/spacing tokens; add a divider token
    only if one doesn't already exist.
- **Out of scope**: redesigning the controls themselves, the labeling-mode cards,
  or the tuning controls; changing log contents beyond adding a per-printer tag.
