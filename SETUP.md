# Moverse — Setup (the steps that need your accounts & hardware)

The code is built. These steps wire it to your Airtable, Anthropic key, Cloudflare account, and printer. They map to task groups 1, 2.4–2.5, and 5 in `openspec/changes/moverse-mvp/tasks.md`.

## 1. Airtable base

1. Create a base named **Moverse** with two tables.
2. **Boxes** table fields:
   - `Box Code` — Single line text (primary)
   - `Type` — Single select: `Suitcase`, `Shipping box`
   - `Destination` — Single select: `With me`, `Shipment`
   - `Name / Notes` — Single line text
   - `Status` — Single select: `Packing`, `Sealed`, `Arrived`
   - `Items` — created automatically when you add the `Box` link on Items (below)
3. **Items** table fields:
   - `Item Code` — Single line text (primary)
   - `Photo` — Attachment
   - `Description` — Long text
   - `Box` — Link to another record → **Boxes** (allow linking to one record)
   - `Destination` — Lookup → from `Box`, showing `Destination`
   - `Created` — Created time
4. On **Items**, add a **Gallery** view grouped by `Box`, and a **Grid** view filtered to `Destination = With me`.
5. Create a **personal access token** (airtable.com/create/tokens) with scopes `data.records:read`, `data.records:write` on this base. Note:
   - the **token** (`pat…`)
   - the **base ID** (`app…`, from airtable.com/api or the base URL)

## 2. Deploy the Worker

```sh
cd worker
npm install
npx wrangler login
npx wrangler secret put ANTHROPIC_API_KEY   # your Anthropic key
npx wrangler secret put AIRTABLE_TOKEN       # the pat… from step 1
npx wrangler secret put AIRTABLE_BASE_ID     # the app… from step 1
npx wrangler secret put APP_SECRET           # any long random string (optional but recommended)
npm run deploy                               # prints the Worker URL
```

If your Airtable table/field names differ from the defaults, edit `[vars]` in `worker/wrangler.toml`.

**Verify (task 2.5):**
```sh
# /save — creates a row (uses a tiny 1x1 jpeg here just to exercise the path)
curl -s https://YOUR-WORKER-URL/save \
  -H 'content-type: application/json' -H 'x-app-secret: YOUR_APP_SECRET' \
  -d '{"itemCode":"ITM-9999","boxCode":"BOX-9999","description":"test","imageBase64":""}'
# → {"ok":true,...} and a new Item appears in Airtable
```

## 3. Point the app at the Worker

Edit `mobile/src/config.ts`:
- `WORKER_URL` → your deployed Worker URL
- `APP_SECRET` → the same string you set above (or leave `""` if you skipped it)

## 4. Print QR labels

Easiest: use the **NIIMBOT app's built-in serial-number** feature to print sequential QR codes `ITM-0001…` and `BOX-0001…` to the B1.

Or generate a printable sheet locally:
```sh
cd scripts
npm install
node generate-labels.mjs BOX 1 40    # → labels-BOX.html
node generate-labels.mjs ITM 1 200   # → labels-ITM.html
```
Open the HTML and print. Stick `BOX-*` labels on suitcases/boxes; keep the `ITM-*` roll handy.

## 5. Run the app

```sh
cd mobile
npm install
npx expo start            # scan the QR with Expo Go on your Android phone
```
Then run one item end to end (task 5.1): scan `ITM-*` → photo → confirm description → scan `BOX-*` → save, and confirm it shows up in the Airtable Gallery view.

Build a standalone APK (task 5.4):
```sh
npm install -g eas-cli
eas build -p android --profile preview
```
