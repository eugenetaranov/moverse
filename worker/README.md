# Moverse Worker

Cloudflare Worker that proxies the two external calls so the Anthropic and Airtable secrets never ship on the device.

## Endpoints (POST JSON)

- `POST /describe` `{ imageBase64 }` → `{ description }`
  Calls the Anthropic Messages API (`claude-haiku-4-5`) with a base64 image block and a terse ≤10-word prompt.
- `POST /save` `{ itemCode, boxCode, description, imageBase64 }` → `{ ok, itemId }`
  Find-or-creates the Box row, creates the Item row (linked to the Box), then uploads the photo to the Item's `Photo` attachment field via Airtable's Upload Attachment content API.

If `APP_SECRET` is set, every request must send a matching `x-app-secret` header.

## Config

- Secrets (`wrangler secret put`): `ANTHROPIC_API_KEY`, `AIRTABLE_TOKEN`, `AIRTABLE_BASE_ID`, and optional `APP_SECRET`.
- Non-secret vars in `wrangler.toml`: `ANTHROPIC_MODEL`, `AIRTABLE_ITEMS_TABLE`, `AIRTABLE_BOXES_TABLE`, `AIRTABLE_PHOTO_FIELD`.
- Local dev: copy `.dev.vars.example` → `.dev.vars`, then `npm run dev`.

Deploy: `npm install && npm run deploy`. See the repo-root `SETUP.md` for the full sequence.
