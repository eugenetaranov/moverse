## Why

Moving between two homes/countries means packing items into suitcases (carried personally) and big boxes (shipped by freight) — and later needing to know *what went where*, with photos as the primary reference. Plain spreadsheets don't display photos usefully. We need a fast, personal Android app that captures each item (label + photo + auto-description + box assignment) and stores it in a photo-friendly, searchable place. Target scope is ~2 evenings.

## What Changes

- New Expo/Android app that walks the user through packing an item: scan its QR label → take a photo → auto-generate a short description (user confirms/edits) → scan the destination box/suitcase QR → save.
- QR labels are **pre-printed** in bulk via the official NIIMBOT app and only **scanned** in the app. Prefixes distinguish scans: `ITM-*` (items) vs `BOX-*` (boxes/suitcases). Direct NIIMBOT B1 Bluetooth printing is **out of scope** for v1.
- A Cloudflare Worker proxy holds the Anthropic and Airtable secrets and exposes two endpoints: `/describe` (photo → short description via Claude Haiku 4.5 vision) and `/save` (create item record + upload photo attachment + link to box in Airtable).
- Airtable is the backend and the browsing UI: two tables (Boxes, Items) with a photo Gallery view grouped by box and a "with me" filtered view — no custom viewer is built.

## Capabilities

### New Capabilities
- `label-scanning`: Camera-based QR scanning that reads a code, validates/routes it by prefix (`ITM-` vs `BOX-`), and rejects unexpected codes.
- `item-capture`: The packing workflow that sequences item scan → photo capture → description confirmation → box assignment → save, with clear success/error states.
- `ai-description`: Generating a short, human-editable description of a packed item from its photo via the `/describe` endpoint (Claude Haiku 4.5 vision).
- `inventory-store`: Persisting and browsing inventory in Airtable — the Boxes/Items schema, creating an item with its photo attachment, linking it to a box, and the views used to answer "what went where" / "what's coming with me".

### Modified Capabilities
<!-- None — greenfield project, no existing specs. -->

## Impact

- **New app**: Expo (React Native) Android project using `expo-camera` (QR scan + photo). Runs in Expo Go for dev; standalone APK via EAS for daily use.
- **New service**: single-file Cloudflare Worker (secrets via `wrangler secret put`: `ANTHROPIC_API_KEY`, `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`).
- **External dependencies**: Anthropic Messages API (`claude-haiku-4-5`), Airtable Web API (record create + Upload Attachment content endpoint).
- **One-time setup**: Airtable base (Boxes, Items, views); pre-printed QR label batches via the NIIMBOT app.
- **Secrets** live only in the Worker, never on-device.
