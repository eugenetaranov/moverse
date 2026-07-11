# Moverse

A personal Android app for tracking what goes in which suitcase or shipping box during a move between homes/countries. Per item: scan a pre-printed QR label → photo → auto-description (Claude Haiku 4.5 vision) you confirm → scan a box QR to assign it → saved to Airtable, browsable as a photo gallery grouped by box.

Direct NIIMBOT B1 Bluetooth printing is out of scope for v1 — labels are pre-printed via the official NIIMBOT app and only scanned here.

## Layout

- `mobile/` — Expo (Android) app: `expo-camera` for QR scanning + photos; a step-by-step capture flow in `App.tsx`.
- `worker/` — Cloudflare Worker proxy holding the Anthropic + Airtable secrets. `POST /describe` (photo → short description) and `POST /save` (create item + upload photo + link box).
- `scripts/` — `generate-labels.mjs`, a printable QR-label sheet generator.
- `openspec/changes/moverse-mvp/` — the spec-driven change (proposal, design, specs, tasks).

## Getting it running

See **[SETUP.md](./SETUP.md)** — it covers the Airtable base, deploying the Worker with your secrets, printing labels, and running the app. The code is complete; those steps need your accounts and hardware.

## Data flow

```
phone → /describe (Claude Haiku 4.5) → confirm text
phone → /save     (Airtable: create Item, link Box, upload Photo)
Airtable Gallery view = "what went where"
```
