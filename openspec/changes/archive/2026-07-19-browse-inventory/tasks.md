## 1. Backend — read & update endpoints

- [x] 1.1 In `lib/moverse.ts`, relax `guard` so read endpoints accept `GET` (keep POST-only for writes) while still enforcing the optional `x-app-secret` header
- [x] 1.2 Add `handleListBoxes(c)`: list all Boxes (paginating like `nextItemCode`), return `[{ boxCode, name, type, destination, status, itemCount }]` (item count from the `Items` link length)
- [x] 1.3 Add `handleListItems(c, boxCode?)`: list all Items (paginated), resolving each item's linked box codes and photo `thumbnails.large.url` (+ full url), return `[{ itemId, itemCode, description, photoUrl, photoThumbUrl, boxCodes[], destination }]`; when `boxCode` is given, filter to items linked to that box
- [x] 1.4 Add `handleItemUpdate(c, { itemId, description?, boxCodes? })`: PATCH description when present; when `boxCodes` present, `findOrCreateBox` each and `setItemBoxes` to exactly that set; leave absent fields unchanged
- [x] 1.5 Add edge routes `api/boxes.ts`, `api/items.ts` (GET, parse `?box=`), `api/item-update.ts` (POST), mirroring the existing handler wrappers and error handling (never log payloads)
- [x] 1.6 Add `/boxes`, `/items`, `/item-update` rewrites to `vercel.json`
- [ ] 1.7 Verify with `curl`: `/boxes` returns boxes with counts; `/items` and `/items?box=BOX-…` return items with photo thumb URLs and box codes; `/item-update` changes a description and box links  <!-- needs deploy -->>

## 2. Mobile — navigation shell

- [x] 2.1 Add deps: `@react-navigation/native`, `@react-navigation/bottom-tabs`, `@react-navigation/native-stack`, `react-native-screens`, `react-native-safe-area-context`
- [x] 2.2 Extract the current hub from `App.tsx` into `src/screens/Pack.tsx` with behavior unchanged; lift shared UI (`PrimaryButton`, `SecondaryButton`, styles, toast) into `src/ui.tsx`
- [x] 2.3 Rewrite `App.tsx` as `NavigationContainer` + bottom `Tab.Navigator` with Pack and Browse tabs (icons + labels, active-state styling, safe-area insets)
- [ ] 2.4 Verify Pack still captures end-to-end (scan → photo → describe → box → save) and per-tab state persists across tab switches  <!-- needs device -->

## 3. Mobile — inventory API client

- [x] 3.1 Add `src/inventory.ts`: `listBoxes()`, `listItems(boxCode?)`, `updateItem({ itemId, description?, boxCodes? })` calling the new endpoints via the existing `WORKER_URL`/`APP_SECRET` header helper; export `Box` and `Item` types
- [x] 3.2 Add a lightweight session cache + `refresh()` for the fetched items/boxes used by browse screens

## 4. Mobile — browse screens

- [x] 4.1 `src/screens/BrowseHome.tsx`: sticky search field + `Boxes | Items` segmented control; loads inventory on focus; pull-to-refresh; loading/empty/error states
- [x] 4.2 Boxes segment: `FlatList` of box cards (code, name, type icon, destination badge, item count); tap → `BoxDetail`
- [x] 4.3 Items segment: `FlatList numColumns={2}` of item photo cards (photo with reserved aspect-ratio, code, box chip(s), `accessibilityLabel`); tap → `ItemDetail`
- [x] 4.4 Search: debounce (~250ms), case-insensitive substring over item code + description, de-duplicate per item, render as item cards; "no results" state referencing the query; clearing restores the segment list
- [x] 4.5 `src/screens/BoxDetail.tsx`: box header (code/name/type/destination) + item photo grid via `listItems(boxCode)`; empty state; edit box name/notes, type, destination via `updateBox` (new `/box-update` endpoint added to close a spec gap)
- [x] 4.6 `src/screens/ItemDetail.tsx`: large photo, code, editable description (save → `updateItem`, success feedback), destination, box chips with "add/move box" that opens the existing `Scanner` for `BOX-` labels and persists via `updateItem({ boxCodes })`; reject wrong-prefix scans

## 5. Verification

- [ ] 5.1 Run in Expo Go: Browse lists boxes and items, box contents show correct items with photos, item shows its box chip(s)
- [ ] 5.2 Search finds an item by description ("coat") and by code ("0042"); "no results" shows for a non-match; clearing restores the list
- [ ] 5.3 Edit an item description and add/move it to another box by scanning; confirm the change persists (re-fetch / check Airtable)
- [ ] 5.4 Confirm empty, loading, error/retry, and pull-to-refresh states; verify safe-area insets and 48dp tab/touch targets
- [ ] 5.5 `eas build -p android` (or existing APK flow) and smoke-test Pack + Browse on-device
