## Why

Box labels always encode the **box code** (e.g. `BOX-001`) in the QR. That's useful
for the app's own scanning, but a box that ends up with a mover, a storage company,
or a family member is more useful if its QR opens something actionable — a WhatsApp
`wa.me` link, a contact URL, or a tracking page — rather than an opaque internal
code. Users want to choose what the QR carries. And on small stock there's no room
for a QR at all, so the label should degrade cleanly to text.

## What Changes

- **The box-label QR content becomes a choice**: encode the **box code** (current
  behavior, default) **or** a **URL** (e.g. a `wa.me` link or any address), with an
  optional `{code}` placeholder so the encoded link can still carry the box code
  (`https://wa.me/15551234567?text=Box%20{code}`).
- **The choice is offered only when a QR will actually print** — i.e. when a printer
  assigned box labels is connected with a QR-capable (large enough) label and has
  passed a test print. Otherwise the QR-content control is disabled with a note
  explaining why, since the setting would have no effect.
- **Small labels degrade to text-only** (unchanged intent, made explicit): when the
  box printer's label is too small for a QR, the label prints the **box id plus the
  user's extra text** and no QR — the QR-content choice is simply not applied.

## Capabilities

### New Capabilities
- `box-label-content`: What a box label encodes and prints — a configurable QR
  payload (box code vs a URL template with an optional `{code}` placeholder), the
  conditions under which the choice is offered (QR-capable box printer, test
  passed), and the small-label text-only fallback (box id + extra text, no QR).

## Impact

- **Mobile app** (`mobile/src/`):
  - `labelSettings.ts` — persist a `boxQrContent` setting: `{ mode: "code" | "url",
    urlTemplate: string }` (new `moverse.boxQrContent` key); load/save helpers.
  - `niimbot/label.ts` — `renderBoxLabel` takes the resolved QR payload string
    (computed from the setting + box code) instead of always using the box code;
    keep the existing "no QR on small labels" branch and ensure it prints box id +
    extra text.
  - `Settings.tsx` — in the Box labels section, add a QR-content toggle (Box code /
    Link) and, when Link, a URL-template field; enable it only when a connected
    box-role printer has a QR-capable label and a passed test print, with a disabled
    note otherwise.
  - `screens/Pack.tsx` — the add-a-new-box print path resolves the QR payload from
    the setting before calling `renderBoxLabel`.
  - Per-printer "test passed" state (set when a test print completes without error)
    is tracked so the toggle's gate can reference it.
- **Out of scope**: per-box (rather than global) QR content; QR error-correction /
  size tuning; validating that the URL resolves; item-label QR content (items keep
  encoding their code).
