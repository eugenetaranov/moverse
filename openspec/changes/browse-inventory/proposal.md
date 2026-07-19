## Why

The MVP captures items well but pushed all *browsing* to Airtable itself — you leave the app to answer "what's in box 3?", "where did I put the winter coat?", or "what's coming with me?". While packing (and later, while unpacking at the destination) the phone is already in hand; hopping to Airtable's web UI is slow and clumsy. Bringing browse/search into the app makes the inventory usable at the moment and place it's needed.

## What Changes

- **BREAKING (app shell)**: the app gains a bottom **tab bar** with two tabs — **Pack** (today's capture hub, unchanged in behavior) and **Browse**. This introduces `@react-navigation` and refactors the current single-surface `App.tsx` into a `Pack` screen plus a `Browse` stack.
- New **Browse** stack with four views:
  - **Boxes list** — every box as a card (code, name, type, destination, item count, photo mini-collage).
  - **Box contents** — the items inside one box, as a photo grid.
  - **All items** — every item as a photo card, each showing which box(es) it's in.
  - **Search** — filter items by item **code** or **description** (debounced, case-insensitive substring), results as item cards with their box.
- **Item detail** and **box detail** screens with *light edits*: edit an item's description, add/move an item to another box (scan a `BOX-` label, reusing the existing scanner + union save), and edit a box's name/notes, type, and destination.
- New backend **read endpoints** so the app can list inventory without shipping the Airtable token on-device: `GET /boxes` and `GET /items` (with an optional `?box=` filter). A new `POST /item-update` endpoint backs the light edits (patch description, set box links).
- Photos are shown from Airtable attachment **thumbnail URLs** returned by the read endpoints; the app fetches fresh each session (these URLs expire) and supports pull-to-refresh.

## Capabilities

### New Capabilities
- `app-navigation`: The two-tab app shell (Pack | Browse) built on React Navigation — tab structure, the Browse stack, active-tab state, and safe-area handling. Refactors the existing capture UI into the Pack tab without changing its behavior.
- `inventory-browsing`: The in-app browse experience — boxes list, box contents, all-items list, item search, and the item/box detail screens with light edits. Covers list virtualization, empty/loading/error states, and pull-to-refresh.
- `inventory-read-api`: Backend endpoints that expose inventory for reading and light editing while keeping secrets server-side — `GET /boxes`, `GET /items` (optionally scoped to a box), `POST /item-update` (description and box links), and `POST /box-update` (box name/type/destination/status).

### Modified Capabilities
<!-- None archived to openspec/specs/ yet; the MVP's inventory-store "Browse inventory by box and by destination" requirement (Airtable gallery) is superseded in practice by inventory-browsing, but there is no baseline delta to write. -->

## Impact

- **Mobile app**: adds `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`, and their peer deps (`react-native-screens`, `react-native-safe-area-context`). `App.tsx` becomes the navigator; the current hub moves to `src/screens/Pack.tsx`. New browse screens + an `inventory` API module in `src/`.
- **Backend** (`lib/moverse.ts` + `api/`): three new handlers and routes (`/boxes`, `/items`, `/item-update`) added alongside `/describe`, `/save`, `/next-code`; new `vercel.json` rewrites. Reuses the existing `guard`/`cfg`/Airtable helpers. Read endpoints relax the POST-only guard to allow `GET`.
- **External dependencies**: Airtable Web API list/records reads (with `thumbnails` on the `Photo` attachment) and a record `PATCH`. No new third-party services.
- **Data model**: unchanged — reuses the existing Boxes/Items tables and the item↔box link (including items in multiple boxes).
