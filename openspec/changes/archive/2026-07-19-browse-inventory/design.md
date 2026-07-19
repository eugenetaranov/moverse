## Context

The MVP is a single-surface Expo app (`App.tsx` with a `mode` state machine: `home | capture | photo | scanItem | scanBox | settings`) plus a Vercel edge backend (`lib/moverse.ts`) exposing `/describe`, `/save`, `/next-code`. Airtable is the store: **Boxes** (`Box Code`, `Type`, `Destination`, `Name / Notes`, `Status`, `Items` link) and **Items** (`Item Code`, `Photo` attachment, `Description`, `Box` link, `Destination` lookup, `Created`). An item may be linked to multiple boxes (the save path unions box links).

Browsing today happens in Airtable's web gallery. This change builds an in-app browse experience. The app currently has **no navigation library** and **no read endpoints** — both are added here. Design language is already established and deliberate: light background, monochrome (`#111` / `#111827`) with a blue-ish accent (`#9fb3d1`), system fonts, uppercase micro-labels, 48px (`MIN_TAP`) touch targets, transient toasts. We keep that language rather than adopting a new style.

## Goals / Non-Goals

**Goals:**
- Answer, in-app and fast: "what boxes exist?", "what's in this box?", "where is this item?", "find the item called/coded X".
- Keep the Pack flow's behavior identical; only relocate it under a tab.
- Keep the Airtable token server-side — the app never talks to Airtable directly.
- Photo-first: every list/grid leads with the item photo.
- Handle the real states: loading (skeleton), empty, error/retry, and "no search results".

**Non-Goals:**
- Offline caching / sync (assume connectivity, as in the MVP). One in-memory fetch per session with pull-to-refresh.
- Bulk operations, multi-select, delete of items/boxes (light edits only).
- iOS-specific polish (Android is the target; code stays cross-platform).
- Server-side search/pagination (dataset is a single personal move — hundreds, not millions).
- Deep linking / URL state (single personal app; typed nav params only).

## Decisions

**Navigation: React Navigation, bottom tabs + native stack** (vs extending the existing `mode` state machine). The `mode` switch works for one linear flow but doesn't give a back stack, per-tab state preservation, or a tab bar. React Navigation is the RN standard (`@react-navigation/native` + `bottom-tabs` + `native-stack`). Structure:
- `RootTabs` → **Pack** (the current hub, extracted to `src/screens/Pack.tsx` unchanged) and **Browse** (`BrowseStack`).
- `BrowseStack`: `BrowseHome` → `BoxDetail` → `ItemDetail`, and `BrowseHome` → `ItemDetail`.
Alternative (keep `mode`): rejected — reimplementing a back stack and tab state by hand is more code and less robust than the library.

**One combined browse screen with a segmented control** (vs separate Boxes/Items tabs). `BrowseHome` hosts a sticky search field + a `Boxes | Items` segmented toggle. Keeps the tab bar to two top-level items (Pack/Browse) and matches the "portfolio-grid, filter by category" pattern. The segment state is local screen state.

**Search is client-side over a cached `/items` fetch** (vs a server search endpoint). On entering Browse, the app fetches `/items` once and holds it in memory; search filters that array (code OR description, case-insensitive substring, debounced ~250ms). Instant, no per-keystroke network, trivially supports "no results". Justified by scale (a personal move). Pull-to-refresh re-fetches. Alternative (server `filterByFormula` search): more moving parts and network latency for no benefit at this scale.

**New read endpoints return flattened, photo-ready JSON** (vs the app calling Airtable). Secrets must stay off-device, so the backend adds:
- `GET /boxes` → `[{ boxCode, name, type, destination, status, itemCount }]`.
- `GET /items` (optional `?box=CODE`) → `[{ itemId, itemCode, description, photoUrl, photoThumbUrl, boxCodes[], destination }]`, where `photoThumbUrl` comes from the Airtable attachment's `thumbnails.large.url`.
The read endpoints accept `GET` (the existing `guard` is POST-only; it is relaxed to allow GET for reads while still checking the optional `x-app-secret`). Reuses the existing `airtableApi`/`authHeaders` helpers and pagination loop (as in `nextItemCode`).

**Light edits via one `POST /item-update`** (vs several endpoints). Body `{ itemId, description?, boxCodes? }` patches the description and/or sets the item's box links (find-or-create each box code by reusing `findOrCreateBox`, then `setItemBoxes`). "Add box" = union current + new; "move" = replace. Adding a box could also reuse `/save`, but `/save` requires a photo-shaped payload and can't remove links — a dedicated update endpoint is cleaner for the detail screen.

**Lists use `FlatList`, grids use `FlatList numColumns={2}`** (vs `ScrollView` + map). Virtualization for 50+ items is a hard RN guideline; item counts in a move easily exceed that. Photo cards declare a fixed `aspectRatio` so images reserve space (no layout shift) and use `accessibilityLabel` (code + description).

**Keep the existing visual system** (vs the tool's auto style pick of OLED-dark + handwritten font). Consistency across Pack and Browse outranks introducing a second style. New surfaces reuse the existing palette, spacing, `MIN_TAP`, button components, and toast pattern (lifting the shared ones out of `App.tsx` into `src/ui.tsx`).

## Risks / Trade-offs

- **Airtable attachment/thumbnail URLs expire (~2h)** → The app fetches on session start and on pull-to-refresh; it never persists URLs. Acceptable for a browse session.
- **Relaxing `guard` to allow GET widens the surface** → Reads still require the optional `x-app-secret` header, expose no secrets, and are read-only except `/item-update` (which stays POST). Personal-use risk is low.
- **`GET /items` fetches the whole table each session** → Fine at personal scale; the Airtable pagination loop already handles >100 rows. If it ever grows, add `?box=` scoping (already supported) and/or server pagination.
- **Refactor risk moving the hub into a tab** → Pack behavior must not change. Mitigate by extracting `App.tsx`'s hub verbatim into `Pack.tsx` (props/state unchanged) and shared UI into `src/ui.tsx`, verifying one capture end-to-end before adding Browse.
- **Editing a box's destination changes an item's looked-up destination** → Expected (Destination is a lookup from Box); surfaced to the user on the box detail screen.
- **Items in multiple boxes** → All list/detail views render box membership as chips (plural), and search results de-duplicate per item.

## Migration Plan

Additive and incremental:
1. Backend first: add `/boxes`, `/items`, `/item-update` handlers + routes + rewrites; verify with `curl`. No existing endpoint changes except the `guard` GET relaxation.
2. Add React Navigation deps; wrap the current hub in a single-tab navigator (Pack only) and confirm capture still works.
3. Add the Browse tab and screens against the live read endpoints.
No data migration; rollback = revert the app/back-end additions (endpoints are unused by the MVP flow).

## Open Questions

- Should box detail allow **removing** an item from a box (unlink), or only re-assigning from the item side? (Current plan: manage box membership from the item detail; box detail edits box metadata only.)
- Sort order for the all-items list — newest `Created` first vs by item code? (Default: newest first.)
