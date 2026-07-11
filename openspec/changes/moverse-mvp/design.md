## Context

Greenfield personal app. The user is moving between two countries and must track which items go in which suitcase (carried) vs shipping box (freight), with photos as the primary reference. The user owns a NIIMBOT B1 label printer. Research found that direct B1 printing from a custom app is a multi-day Bluetooth spike on alpha-stage community libraries with no official SDK — so v1 relies on pre-printed, scanned QR labels instead. Constraint: ship in ~2 evenings.

## Goals / Non-Goals

**Goals:**
- Capture an item in under ~15 seconds: scan → photo → auto-description (confirm) → scan box → save.
- Store items/boxes where photos display well and search/filter is trivial ("what's with me", "what's in box 3").
- Keep API secrets off the device.

**Non-Goals:**
- Direct NIIMBOT B1 Bluetooth printing (deferred; labels are pre-printed via the official NIIMBOT app).
- Multi-user auth / accounts (single personal user, optionally a partner).
- iOS (Android only for v1).
- A custom web/browsing UI (Airtable's gallery view serves this).
- Offline queueing / sync (assume connectivity while packing).

## Decisions

**Backend + viewer = Airtable** (vs Supabase / Google Sheets). Airtable has native photo attachments and a Gallery view (photo cards), plus instant filtering on phone and web — this directly solves the "photos don't fit in sheets" problem with zero viewer code. Google Sheets only stores image links (the exact limitation to avoid). Supabase would need a custom viewer. Trade-off: Airtable free-tier row/attachment limits — acceptable for a personal move.

**Labels: scan pre-printed QR** (vs direct print / print-later). No Bluetooth, no custom native modules, fits the time budget. Codes are pre-generated sequences printed via NIIMBOT's own app. Prefixes `ITM-` / `BOX-` let a single scanner route the code by type. A scanned code is the record's primary key — no pre-registration; a code is "created" on first save.

**Secrets via a Cloudflare Worker proxy** (vs keys embedded in the app). Both the Anthropic key and Airtable token must not ship on-device. A single-file Worker exposes `/describe` and `/save`, holds the secrets (`wrangler secret put`), and centralizes the two external calls. Free tier, ~20 min to deploy. Trade-off: one more deploy target; justified by not leaking keys.

**AI description model = `claude-haiku-4-5`** (vs Sonnet/Opus). Cheapest/fastest vision tier ($1/$5 per 1M tokens); the task (a ≤10-word item name from a photo) needs no more. `max_tokens ~150`, base64 `image` content block, terse prompt.

**Photo upload via Airtable's Upload Attachment content API.** `POST https://content.airtable.com/v0/{baseId}/{recordId}/{fieldId}/uploadAttachment` accepts base64 directly — no separate image host is required. Flow in `/save`: ensure Box row exists → create Item row (with Box link) → upload photo to the Item's `Photo` field.

**Camera stack = `expo-camera` `CameraView`.** Built-in barcode scanning (`onBarcodeScanned`) + `takePictureAsync` cover both needs with no native module, so dev can run in Expo Go; ship a standalone APK via EAS at the end. (`expo-barcode-scanner` is deprecated/folded into `expo-camera`.)

## Risks / Trade-offs

- **Airtable free-tier limits (rows/attachment storage)** → A single move should fit; if not, downscale photos harder or upgrade the plan.
- **On-device photos are large / slow to upload** → Downscale to ~1024px and JPEG-compress before sending base64 to the Worker.
- **Claude misreads a wrapped/ambiguous item** → Description is always shown in an editable field; the user confirms/corrects before save.
- **Wrong-prefix scan (item code where a box is expected, or vice versa)** → Validate prefix at each scan step and reject with a clear message.
- **Worker holds real secrets on a public URL** → It only proxies two shapes and can be given a shared secret header; personal-use risk is low, but don't log payloads.
- **Alpha NIIMBOT libraries** → Avoided entirely by not printing in-app; revisit only if in-app printing becomes a hard requirement.
