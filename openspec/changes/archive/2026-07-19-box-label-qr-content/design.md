# Design — box-label QR content

## The content model

```ts
type BoxQrMode = "code" | "url";
interface BoxQrContent {
  mode: BoxQrMode;      // default "code"
  urlTemplate: string;  // used when mode === "url"
}
```

Payload resolution at print time, given the box code:

- `mode === "code"` → payload is the box code verbatim (`BOX-001`).
- `mode === "url"` → payload is `urlTemplate` with `{code}` replaced by the box code.
  If the template has no `{code}`, the box code is not appended — the user's URL is
  encoded as-is (they may want a plain contact link). The box code still prints as
  **text** on the label regardless, so the human-readable id is never lost.

Example templates:
- `https://wa.me/15551234567` — plain WhatsApp contact.
- `https://wa.me/15551234567?text=Box%20{code}` — opens a chat prefilled with the box.
- `https://track.example.com/{code}` — a per-box tracking page.

## When the choice is offered

The QR only ever prints on a **QR-capable** (large enough, `fitsQr`) label, and only
box-role printers print box labels. So the QR-content control is meaningful only when
**a connected printer assigned box labels has a QR-capable label size and has passed a
test print**. Outside that, the control is disabled with a short reason ("Connect a
large-label box printer and run a test print to choose QR content"), because changing
it would have no visible effect.

"Test passed" is tracked as a per-printer boolean set when a test print completes
without error (session state is enough; it does not need to persist). This reuses the
existing test-print path — no new print flow.

## Small-label fallback

`renderBoxLabel` already prints text-only when `!fitsQr(size)`. This change keeps that
branch and makes the contract explicit: small label → **box id (prominent) + wrapped
extra text, no QR**. The QR-content setting is simply not consulted in that branch.

## Why global, not per-box

A move uses one contact/link scheme across all boxes; asking per box would be friction
for no real benefit. Per-box override is deferred (noted out of scope). The setting is
global, applied to every box label at print time.
