# Platform foundation — Design

## Context

Current state (branch `commercial-mvp-foundation`):

- **Mobile** (Expo 52, Android). `mobile/src/api.ts` and `mobile/src/inventory.ts` each build an `x-app-secret` header from `config.ts`. Codes for print-before-save come from in-memory counters in `reservation.ts` / `boxReservation.ts`, seeded from the server max; they are safe only with one device. `App.tsx` is a two-tab navigator with no auth gate.
- **API** (Vercel Edge functions). `api/*` are thin wrappers over `lib/moverse.ts` (589 lines of Airtable fetch). `guard()` checks the shared secret. `/save` takes the photo as base64 in the JSON body.
- **DB drafts** (not applied anywhere yet). `supabase/migrations/0001_schema.sql` holds the org → job → boxes/items tables and sequence functions. `0002_rls.sql` holds one `for all` membership policy per table. `tests/rls_cross_tenant.test.sql` checks SELECT on 4 tables.

The team review found that `0002` lets any member write any row in their org. That means crew can promote themselves to owner, set `orgs.plan`, reset `usage`, read invite and report tokens, and link items to foreign boxes. `photos.storage_path` is client-controlled. Crew job scoping is not enforced anywhere.

Constraints:
- Solo founder.
- The first beta company is the target.
- Crews wear gloves, churn, and share phones.
- Packing happens in basements without signal.
- NIIMBOT printing must keep working unchanged.

## Goals / Non-Goals

**Goals**
- Real per-user identity in mobile and API; the shared secret deleted.
- One permission model (org roles + crew job assignment), enforced in the API and again in Postgres.
- Inventory, photos, and codes on Supabase + R2, with today's flows behaving identically for a personal user.
- Write paths safe to retry: the server contract an offline queue needs.
- Founder data migrated with zero loss, and a rollback path during beta.
- Portable across Supabase Cloud and self-hosted, so staging can run on Proxmox and prod can move later.

**Non-Goals**
- Billing, web, report page, design system, offline queue UI (see proposal).
- Real-time sync, social/SSO login, 2FA, iOS.

## Decisions

### D1. Environments and hosting

| Env | Supabase | R2 bucket | API | Mobile build |
| --- | --- | --- | --- | --- |
| local | `supabase start` (Docker) | `moverse-dev` or MinIO | `vercel dev` | dev client → LAN API |
| staging | self-hosted `supabase/docker` on a Proxmox VM behind Cloudflare Tunnel (or Cloud free) | `moverse-staging` | Vercel Preview | EAS `preview` |
| prod | Supabase Cloud Pro, EU region | `moverse-prod` | Vercel Production | EAS `production` |

All environment differences live in env vars:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET` (optional)
- `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`
- `ANTHROPIC_API_KEY`

Mobile receives only `API_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY` via `app.config.ts` `extra` per EAS profile. The anon key is public by design.

Portability rules, so staging on self-hosted and prod on Cloud stay interchangeable:
- No Supabase Storage, Realtime, or Edge Functions.
- Only Postgres, PostgREST, and GoTrue.
- Migrations are plain SQL in `supabase/migrations`.
- `pg_cron` is used only for DB-internal cleanup.

### D2. Auth methods

| Who | Method | Why |
| --- | --- | --- |
| Personal user, company owner/admin (mobile) | **Email OTP code** (6 digits) as the primary method; email + password as an alternative | No deep-link round trip: the code is typed in the app. The OTP also proves the email, so there's no separate confirm step. A password suits people who sign in on several devices |
| Same, on web (later) | Magic link + password | Standard web pattern; same GoTrue config |
| Crew | **Anonymous sign-in**, only as part of invite consumption, plus a display name | No email ceremony at the truck (`commercial-mvp` D4) |

GoTrue configuration:
- Email OTP length 6 and expiry 10 minutes.
- Confirm email on.
- Anonymous sign-ins enabled.
- Minimum password length 10.
- Leaked-password check where available.
- **Custom SMTP (Resend or Postmark) is mandatory.** The built-in mailer is limited to a few emails per hour and would block real signups.
- Default GoTrue per-IP rate limits kept.

Crew identity lifecycle:
- An anonymous crew user can later add an email through `updateUser({ email })` plus OTP verification. This converts the account in place, keeping the same `user_id`, so memberships survive a phone change.
- Anonymous users with **no membership** after 24 h are deleted by a cron job, to limit abandoned anonymous accounts.

Session storage (mobile):
- `supabase-js` with `autoRefreshToken` and `persistSession`.
- The session blob is stored with the Expo "LargeSecureStore" pattern: an AES key in `expo-secure-store`, and the encrypted session in AsyncStorage. SecureStore's ~2 KB limit is too small for a Supabase session.
- `AppState` listeners start and stop auto-refresh.
- The mobile app uses supabase-js **only for auth**. All data goes through the API (D6).

### D3. Account structure

```
orgs (kind: personal | company, plan, name)
 ├── memberships (user_id, role: owner | admin | crew)     unique(org_id, user_id)
 ├── jobs (name, client_name, status, box_seq, item_seq, report_token)
 │    ├── job_members (user_id)        ← crew access list; owners/admins see all jobs
 │    ├── boxes, items, item_boxes, photos
 │    └── invites (role crew, expires_at, max_uses, uses, token_hash)
 └── usage (day, describe_count)
```

- **`job_members` is a table, not `memberships.job_id`.** The same crew member works many jobs over weeks. An admin can assign an existing crew member to a new job without a new invite.
- **Membership is per org.** A user may belong to several orgs; the app works in one org and one job at a time (D10).
- **Personal orgs** have exactly one member (the owner) and cannot create invites at MVP. A personal user who starts a company gets a **new** company org; their personal org stays, and the app's org switcher shows both. Merging or moving the personal job into the company is out of scope.
- Every inventory row carries `job_id`. `org_id` is reached through `jobs`. Composite FKs (D7) make cross-job links unrepresentable.

#### Permission matrix

| Action | owner | admin | crew |
| --- | --- | --- | --- |
| See jobs | all in org | all in org | assigned (`job_members`) only |
| Create / rename / archive / unarchive job | ✓ | ✓ | — |
| Capture items, create boxes, upload photos, reserve codes, print | ✓ | ✓ | assigned jobs |
| Edit item description / box links, box name/type/destination | ✓ | ✓ | assigned jobs |
| Change box status (sealed / loaded / delivered) | ✓ | ✓ | assigned jobs |
| Delete items / boxes | ✓ | ✓ | — |
| Run `/describe` | ✓ | ✓ | assigned jobs (counts to org quota) |
| Create / revoke crew invites; assign crew to jobs | ✓ | ✓ | — |
| Invite / promote / demote admins | ✓ | — | — |
| Remove crew members | ✓ | ✓ | — |
| Remove admins | ✓ | — | — |
| Read / regenerate report token | ✓ | ✓ | — |
| Read billing state, change plan | ✓ (plan via webhook only) | — | — |
| Rename org, transfer ownership, delete org | ✓ | — | — |
| Leave org | if another owner exists | ✓ | ✓ |

Exactly one owner per org at MVP; ownership moves only through transfer. In SQL this matrix compiles to two helpers that RLS and RPCs share:
- `org_role(org_id) → member_role | null`
- `can_access_job(job_id) → boolean`: owner or admin of the job's org, or crew with a `job_members` row.

### D4. Provisioning: idempotent bootstrap, not an `auth.users` trigger

A trigger on `auth.users` runs inside GoTrue's transaction. If it fails, signup fails with an opaque error. It also can't tell a personal signup from a company signup or from an anonymous crew user. Instead:

1. The client signs up or signs in. The signup form carries `intent` (`personal` | `company`) and, for company, `org_name`.
2. The client calls `POST /account/provision { intent, orgName? }`. This runs `provision_account(intent, org_name)`, a SECURITY DEFINER function keyed on `auth.uid()`:
   - The user already has a membership → no-op; returns the current state.
   - `personal` → org(kind=personal, name="<display name>'s move") + owner membership + job("My move").
   - `company` → org(kind=company, name) + owner membership, with no job; the app prompts "Create your first job".
   - Anonymous users → refused. They join only through invites.
3. `GET /me` returns `{ user, orgs: [{ id, name, kind, role, plan }], jobs: [{ id, org_id, name, status }], defaults: { orgId, jobId } }`. If a non-anonymous user has zero memberships (for example, the app was killed between steps 1 and 2), `/me` self-heals by provisioning `personal`. The app always calls `/me` after sign-in and treats it as the single source of the user's tenant state.

Each step is a single idempotent transaction, so there are no half-provisioned accounts.

### D5. Invites and crew join

- **Create.** `POST /invites { jobId, expiresInHours = 168, maxUses = 20 }` (owner/admin, company org only):
  - Generates 18 random bytes, base64url-encoded.
  - Stores **`token_hash = sha256(token)`**, never the token itself.
  - Returns the token once.
  - A leaked DB dump or a crew member reading the table can't replay invites.
- **Present.** The QR code and share link encode `https://<domain>/j/<token>`:
  - Android App Links open the app directly (`assetlinks.json` on the domain).
  - Without the app, the page links to the Play listing.
  - The app also has an in-app "Join a team" scanner that accepts the URL or a raw token.
- **Consume.** `POST /invites/consume { token, displayName }`:
  1. If the caller has no session, the app first calls `signInAnonymously()` and sets `display_name` in user metadata.
  2. The API calls `consume_invite(token)`, a SECURITY DEFINER function. It hashes the token, then locks the invite row and checks that it is not expired or revoked and that `uses < max_uses`. It then upserts the org membership as `crew` (never downgrading an existing admin/owner), inserts the `job_members` row, increments `uses`, and returns `{ orgId, jobId }`.
  3. The app sets the current org and job and lands in Pack, locked to that job.
- A signed-in owner/admin of *another* org can consume an invite. They become crew in the inviting org, and their own org is untouched.
- **Revoke.** Setting `revoked_at` revokes an invite. Removing a crew member deletes their membership and `job_members` rows. Existing JWTs stay valid until they expire (≤ 1 h), but every API call re-reads memberships (D6), so access stops immediately.
- **Rate limiting.** `/invites/consume` is limited per IP (D11). With 144-bit tokens, guessing is not practical anyway.

### D6. API request pipeline and the service-role boundary

Every handler is wrapped by `withAuth(handler, { job?: 'required' | 'optional', minRole?, methods })` in `lib/auth.ts`:

1. **Method check**, as `guard()` does today.
2. **Verify the JWT** locally with `jose`:
   - Asymmetric signing keys (Cloud default for new projects) → `createRemoteJWKSet(${SUPABASE_URL}/auth/v1/.well-known/jwks.json)`, cached per isolate.
   - Legacy or self-hosted HS256 → `SUPABASE_JWT_SECRET`.
   - The verifier checks `aud=authenticated`, `exp` and `iss`. It reads `sub` and `is_anonymous`.
   - An invalid JWT → 401 `unauthenticated`.
3. **Create a user-scoped DB client.** `createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: 'Bearer <jwt>' } } })`, so every query runs **as the user under RLS**.
4. **Resolve the job context** if one is needed:
   - Read `X-Moverse-Job: <uuid>`.
   - One query: `select j.id, j.org_id, j.status, m.role, exists(job_members…)` → `ctx.job`, `ctx.role`.
   - A job that is missing or that the caller can't access → 404 `job_not_found`. Never 403, so job IDs can't be probed.
   - A role below `minRole` → 403 `forbidden`.
5. **Run the handler** with `ctx = { userId, isAnonymous, db, job?, role? }`. Errors map to `{ error: <code> }` JSON. Payloads (photos) are never logged.

The **service role** is only available from `lib/privileged.ts`. That module exports a fixed set of functions:
- `deleteAuthUser`
- `presignForOrg` (R2 credentials, not DB)
- `runCleanupJobs`
- `migrationImport` (scripts only)

An ESLint `no-restricted-imports` rule allows `lib/privileged.ts` only from `api/account/delete.ts`, `api/cron/*` and `scripts/*`.

Everything else, including invite consumption and provisioning, goes through SECURITY DEFINER RPCs called with the user's JWT. Those functions check `auth.uid()` themselves. A bug in a handler therefore can't exceed the caller's RLS rights.

Mobile sends the JWT and the job header from one wrapper in `mobile/src/apiClient.ts`:
- Get the session.
- On 401, call `refreshSession()` and retry once.
- On a second 401, sign out to the login screen.

This replaces the two `headers()` copies in `api.ts` and `inventory.ts`.

### D7. Schema and RLS hardening (`0003_hardening.sql`)

Schema changes:
- **`job_members(job_id, user_id, created_at, pk(job_id,user_id))`** (D3).
- **Composite tenancy keys:**
  - `unique(id, job_id)` on `items` and `boxes`.
  - `item_boxes` gains `job_id` with FKs `(item_id, job_id) → items(id, job_id)` and `(box_id, job_id) → boxes(id, job_id)`.
  - `photos` gains `job_id` with FK `(item_id, job_id) → items(id, job_id)`.
  - Linking an item to another job's box is now a constraint violation, not a policy question.
- **Photos:**
  - `item_id` becomes nullable while the photo is pending.
  - Add `status ('pending'|'ready')`, `thumb_path`, `bytes`, `created_by`.
  - `storage_path` is generated by the server (D8), and a check constraint requires it to start with `org/<org_id>/job/<job_id>/`.
- **Items and boxes:**
  - Add `created_by uuid` (null on user delete) and `code_seq int` (the numeric part, for correct sorting; null for named boxes).
  - Boxes add `sealed_at`, `loaded_at`, `delivered_at` (set by trigger on status change).
- **Items: the client provides `id`.** Drop `idempotency_key`; the client-generated UUID primary key *is* the idempotency key (D9).
- **Invites:** `token` is replaced by `token_hash bytea unique`; add `max_uses int`, `uses int`, `revoked_at`.
- **Jobs:** add `report_enabled bool default true`.
- **Indexes:**
  - Drop `boxes_job_idx`, `items_job_idx` and `memberships_org_idx`; the unique constraints already lead with those columns.
  - Add `invites(job_id)`, `jobs(org_id, status)`, `photos(job_id)` and `job_members(user_id)`.
- **Functions:**
  - `reserve_codes` replaces `reserve_item_codes`; it handles both kinds and caps `p_count` at 1..200.
  - `next_*_code` become private (called only from RPCs).
  - `revoke execute … from anon, public` on everything.
  - `set search_path = public, pg_temp` on all functions.

RLS policies:
- One policy per command (`select` / `insert` / `update` / `delete`) instead of `for all`.
- Policies use `(select auth.uid())` and set-returning helpers (`job_id in (select accessible_job_ids())`), so Postgres evaluates them once per statement rather than per row.

| Table | select | insert | update | delete |
| --- | --- | --- | --- | --- |
| orgs | member | — (RPC) | owner: `name` only (column grant) | — (RPC) |
| memberships | member of org | — (RPC) | — (RPC) | — (RPC) |
| jobs | `can_access_job` | owner/admin | owner/admin (`report_token`, `*_seq` not column-granted) | — (archive instead) |
| job_members | owner/admin, or own row | — (RPC) | — | owner/admin |
| boxes, items, item_boxes | `can_access_job` | `can_access_job` | `can_access_job` | owner/admin of job's org |
| photos | `can_access_job` | — (RPC) | — (RPC) | owner/admin |
| invites | owner/admin (no token column exists) | — (RPC) | — (RPC) | — (RPC) |
| usage | owner/admin | — (RPC) | — (RPC) | — |

Column-level privileges (`grant update (name) on orgs to authenticated`) close the `plan`, `stripe_customer_id`, `report_token` and sequence holes even for a role that passes the row policy.

Privileged RPCs are all SECURITY DEFINER, check `auth.uid()` first, and exist in the matrix:
- `provision_account`, `consume_invite`, `create_invite`
- `set_member_role`, `remove_member`, `transfer_ownership`, `leave_org`
- `regenerate_report_token`
- `consume_describe_quota`
- `account_deletion_plan`

### D8. Photo pipeline (R2)

Object keys are built by the server only:
- `org/{org_id}/job/{job_id}/photo/{photo_id}.jpg`
- `org/{org_id}/job/{job_id}/photo/{photo_id}_t.jpg` (thumbnail)

1. **Prepare (client, offline-capable).** Resize to 1024 px long edge (as today) plus a 320 px thumbnail with `expo-image-manipulator`, JPEG ~0.7. Generate `photo_id = uuid()`.
2. **Request upload.** `POST /photos/upload-url { photoId, bytes, thumbBytes }` (job required).
   - Inserts `photos(id, job_id, status='pending', storage_path, thumb_path, created_by)` via RPC. Retrying with the same `photoId` returns the same row.
   - Returns two presigned PUT URLs (aws4fetch, 15 min), signed with `Content-Type: image/jpeg` and the exact `Content-Length`.
   - Rejects `bytes > 2 MB` or `thumbBytes > 200 KB` with 413.
3. **Upload.** The client PUTs both files straight to R2, so the photo never passes through Vercel. That removes the 4.5 MB body-limit and timeout risk of today's base64 `/save`.
4. **Attach.** `/save` (or `/item-add-photo`) carries `photoIds[]`. The API HEADs each object in R2. Missing → 409 `photo_not_uploaded`, so the client re-uploads. Present → the RPC sets `item_id` and `status='ready'`.
5. **Serve.** Read endpoints return `photoUrl` / `photoThumbUrl` / `photoUrls` as presigned GETs with a 1 h expiry, signed per response. HMAC is fast, about 2k signatures in tens of ms. The mobile app already refetches per session, matching today's Airtable-URL behavior.
6. **Delete and cleanup.**
   - Deleting a photo, item, job, org or account inserts its keys or prefixes into `storage_deletions(key_or_prefix, reason, created_at)` in the same transaction.
   - A Vercel cron job (`/api/cron/storage`, every 10 min) drains the queue with R2 DeleteObjects.
   - `pending` photos older than 24 h are deleted the same way.
   - R2 has no transactions, so this outbox pattern keeps the DB and the bucket eventually consistent without blocking user actions.

The `/describe` endpoint keeps taking base64. It needs the image before save, and it is capped at 1.5 MB (D11).

### D9. Inventory writes: RPCs with client IDs

supabase-js has no client transactions, so every multi-row write is one SECURITY INVOKER RPC. It runs under the user's RLS and is atomic:

`save_item(p_job uuid, p_item_id uuid, p_item_code text, p_box_code text, p_new_box bool, p_description text, p_photo_ids uuid[]) returns jsonb`. It keeps today's `handleSave` semantics:

- **Box resolution:**
  1. `p_box_code` is given → find-or-create the box in the job.
  2. Else `p_new_box` → mint `BOX-nn` from the job sequence.
  3. Else → `missing_box`.
- **Item resolution:**
  1. A row with `id = p_item_id` exists → this is a **replay**. Ensure the box link and photos are attached; return `action:'exists'` with the stored code.
  2. Else `p_item_code` is given and an item with that code exists in the job → union the box (`added` / `exists`). Return the *existing* id; the client remaps.
  3. Else `p_item_code` is given → insert with `id = p_item_id`.
  4. Else → mint `ITM-nnnn`, insert → `created`.
- **Sequence repair.** A numeric code the client supplies (from a pool or a hand-written label) bumps the job sequence to `greatest(seq, n)`, so a later mint can never collide with it.
- **Response.** Returns `{ itemId, itemCode, boxCode, action }`, which matches the current `SaveResult`, so `Pack.tsx` needs no flow change.

Other write RPCs follow the same shape:
- `update_item(p_item_id, p_description?, p_box_codes?)`
- `update_box(p_job, p_box_code, …)`
- `delete_items(p_ids uuid[])`, which also serves today's bulk delete
- `move_items(p_ids, p_box_code)`

Concurrency is last-write-wins at MVP, using `updated_at`.

### D10. Current org/job context in the app

- **`JobContext` provider** (mobile). It holds the `/me` result plus `currentOrgId` and `currentJobId`, persisted in AsyncStorage **per user id**. Defaults: the last used job, else `/me.defaults`.
- **Chrome rules:**
  - Personal org with exactly 1 active job → no org/job UI anywhere (today's app).
  - Company owner/admin → job name in the header plus a job switcher sheet. Org switcher only if they belong to more than one org.
  - Crew → locked job header; switcher only among assigned jobs.
- **Data scoping.** `inventory.ts` caches and code pools (D12) are keyed by `jobId`. Switching job or user swaps the active cache. Sign-out wipes every cache, pool and preference keyed to that user.
- **Auth gate in `App.tsx`:** `AuthStack` (Welcome → Email → Code/Password → Choose personal|company) vs `AppTabs`. Deep links `moverse://j/<token>` and `https://<domain>/j/<token>` route to `JoinScreen` from either state.

### D11. Abuse controls

- **`/describe`:** body ≤ 1.5 MB (checked via `content-length` before parsing). `consume_describe_quota(org)` does `insert … on conflict (org_id, day) do update set describe_count = describe_count + 1 … returning describe_count`, compared against the plan limit (free 50/day, company 2,000/day; configurable). Over quota → 429 `quota_exceeded`; the app falls back to manual description, as it does today on describe failure.
- **Auth and invites:** GoTrue's built-in per-IP limits cover OTP, sign-up and anonymous sign-in. `/invites/consume` and `/account/provision` add a Vercel WAF rate-limit rule (configured per path, no code).
- **Generic:** a Vercel WAF per-IP ceiling on `/api/*`. No custom limiter service at MVP.

### D12. Codes: per-job sequences and device pools

- **Formats unchanged:** `BOX-nn` (≥ 2 digits) and `ITM-nnnn` (≥ 4 digits), per job.
- **`POST /codes/reserve { kind: 'item'|'box', count ≤ 200 }`** → `{ kind, first, last, format }`, advancing the job sequence atomically.
- **Mobile `codePool.ts`** replaces `reservation.ts` and `boxReservation.ts`:
  - It keeps a persisted pool per (`jobId`, `kind`).
  - `take()` pops locally and works offline.
  - When fewer than 10 codes remain and the device is online, it refills in the background with 50 items or 20 boxes.
  - `release(code)` puts the code back only if it is the most recent one handed out (today's rule).
  - Pools are discarded on sign-out or when the job is archived; unused numbers leave harmless gaps.
- **Two phones on one job** draw from disjoint server-reserved ranges, so printed labels can't collide.
- **Codeless ("none") mode** online can still let the server mint at save. Offline it takes from the pool and sends the code. Either way `save_item` is correct.
- **`/next-code` and `/next-box-code`** stay as compatibility endpoints, equal to reserving one code. They are removed after the pool ships.

### D13. API surface

Existing paths and body shapes are kept, so the port is mechanical and the contract tests carry over. New routes follow the same flat style. `job` = requires `X-Moverse-Job`.

| Route | Method | Auth | Job | Min role | Notes |
| --- | --- | --- | --- | --- | --- |
| `/me` | GET | user | — | — | bootstrap + self-heal (D4) |
| `/account/provision` | POST | non-anon user | — | — | D4 |
| `/account/profile` | POST | user | — | — | display name; add email (crew upgrade) is via supabase-js |
| `/account/delete` | POST | user | — | — | D14 |
| `/jobs` | GET / POST | user | — | crew (GET) / admin (POST) | `?orgId=` |
| `/job-update` | POST | user | ✓ | admin | rename, client name, archive/unarchive |
| `/invites` | GET / POST | user | ✓ | admin | list active (no tokens) / create |
| `/invite-revoke` | POST | user | ✓ | admin | |
| `/invites/consume` | POST | user (may be anon) | — | — | D5 |
| `/members` | GET | user | — | admin | `?orgId=`; includes job assignments |
| `/member-update` | POST | user | — | admin/owner per matrix | role change, remove, assign/unassign job |
| `/org-transfer` | POST | user | — | owner | |
| `/photos/upload-url` | POST | user | ✓ | crew | D8 |
| `/codes/reserve` | POST | user | ✓ | crew | D12 |
| `/save` | POST | user | ✓ | crew | D9; `imageBase64` replaced by `photoIds[]` |
| `/describe` | POST | user | ✓ | crew | quota (D11) |
| `/items`, `/boxes` | GET | user | ✓ | crew | unchanged shapes; `itemId` becomes a UUID |
| `/item-update`, `/box-update`, `/item-add-photo` | POST | user | ✓ | crew | |
| `/item-delete`, `/box-delete` | POST | user | ✓ | admin | |
| `/next-code`, `/next-box-code` | POST | user | ✓ | crew | compatibility (D12) |
| `/api/cron/*` | GET | Vercel cron secret | — | — | cleanup (D8, D2) |

### D14. Account deletion

`POST /account/delete { confirm: "DELETE" }`:

1. **Plan.** `account_deletion_plan()` returns the orgs where the caller is the sole owner, and whether each has other members.
2. **Blocked case.** If the caller is the sole owner of a company org with other members → 409 `transfer_ownership_required`, with the org list. The app shows "Transfer ownership or delete the company first".
3. **Delete orgs.** Orgs the caller solely owns with no other members (personal, or an empty company org) are deleted. FKs cascade jobs, inventory, invites and usage. `storage_deletions` gets the prefix `org/{id}/`.
4. **Delete the user.** `lib/privileged.deleteAuthUser(uid)`. Memberships and `job_members` cascade. `created_by` columns are set to null; records in company orgs stay with the company, which owns them.
5. **Client.** Clears all local data and returns to Welcome.

The same endpoint will back the web deletion page that Play requires (built in `commercial-mvp`). Photos are removed by the storage cron within minutes, so the DB deletion is immediate.

### D15. Airtable → Supabase/R2 migration and cutover

`scripts/migrate-airtable.ts` (Node, run locally with service role + Airtable token):

1. **Target.** The founder signs up normally on the target environment. The script looks up their personal org and its "My move" job, or `--job <id>`.
2. **Read.** Reads all Boxes and Items with pagination.
3. **IDs.** Deterministic IDs: `uuidv5(airtable_record_id, NAMESPACE)` for boxes, items and photos. **Re-runs upsert and never duplicate.**
4. **Boxes.** Imported with codes verbatim (existing printed labels may be `BOX-0003`; keep as is). Destination and Type map to enums.
5. **Items.** Imported with `item_boxes` links. `code_seq` is parsed.
6. **Photos.** Each attachment is downloaded, a thumbnail generated (`sharp`), both PUT to R2, and `photos` rows inserted as `ready`.
7. **Sequences.** Job `item_seq` / `box_seq` are set to the max numeric codes.
8. **Parity report.** Counts per table, items without boxes, photos per item, and missing downloads. A non-zero diff exits non-zero.

Cutover:
1. Run against staging and dogfood for a few days.
2. Freeze Airtable (remove write access from the token).
3. Do a final run against prod.
4. Ship the mobile build pointing at the new API.
5. Rotate and delete the Airtable token after 30 days.

**Rollback during beta:** the frozen Airtable base plus the previous APK on the old Vercel deployment (kept as a separate project alias).

### D16. Testing strategy

- **DB (pgTAP, `supabase test db`).** A role × table × command matrix over two orgs:
  - Fixtures: owner, admin, crew assigned to J1, crew unassigned, outsider, and `anon`.
  - Explicit escalation cases: crew sets role, crew sets plan, crew reads invites, cross-org `item_boxes` link, foreign `storage_path`, `reserve_codes` count cap.
  - RPC behavior: `save_item` replay, code union, sequence repair; `consume_invite` expiry, revocation and max-uses.
- **API integration (Vitest).** Against `supabase start` plus MinIO for R2:
  - Real JWTs minted by signing in seeded users.
  - Covers every route in D13 for allowed and denied roles.
- **Contract tests.** Recorded from the Airtable implementation for `/save`, `/items`, `/boxes`, `/item-update`, `/box-update` and deletes. Response shapes must match after the port.
- **Mobile unit tests.** `codePool`, the `apiClient` 401/refresh path, and the job-context persistence rules.
- **CI (`ci.yml`).** typecheck → `supabase start` → `db reset` → pgTAP → API tests. Required for merge.

## Risks / Trade-offs

- **[RLS performance on large jobs]** → set-returning helpers and `(select auth.uid())`, plus indexes on `job_id`. Benchmark `/items` for a 3,000-item job in staging. If it's slow, list reads move to one SECURITY INVOKER SQL function that returns the joined shape.
- **[Double enforcement drifts]** (API role checks vs RLS) → the API checks only `minRole` and the job context; fine-grained rules live in SQL. Tests assert both layers deny.
- **[Anonymous crew accounts lost on phone reset]** → a rejoin by invite creates a new user; their old records keep `created_by` pointing to a dead user (set null on purge). Crew can upgrade to email in Settings.
- **[Presigned PUT without a server-side image check]** → a client could upload non-JPEG bytes. Bytes are capped, keys are server-built, and objects are served only through presigned GETs to members. Acceptable at MVP.
- **[JWT stays valid up to 1 h after removal]** → the API re-reads membership on every request; only direct PostgREST access with the anon key would see the lag, and RLS uses live tables anyway.
- **[Self-hosted staging lags Cloud features]** (e.g. asymmetric JWT keys) → the verifier supports both; staging pins a compose version and is upgraded quarterly.
- **[Breaking API for installed APKs]** → there is a single known user (the founder), so a coordinated switch is acceptable. Airtable stays frozen for rollback.

## Migration Plan

1. Rotate `APP_SECRET` now, independent of everything else.
2. Land `0003`–`0005` plus the pgTAP matrix and CI. Create the staging environment and R2 buckets. Configure SMTP.
3. API: `lib/auth.ts`, `/me`, provisioning and contract tests first. Then port endpoints one by one behind `withAuth`. Then photos, codes, invites, members and deletion.
4. Mobile: `apiClient.ts` + session → auth stack → `JobContext` → `codePool` → join flow → Settings (team, sign-out, delete).
5. Run the migration against staging; the founder dogfoods. Then do the prod cutover (D15).

## Open Questions

- Crew-lead role: should a foreman (crew) be able to show an invite QR without being admin? The proposal is to defer; most foremen at small movers are admins.
- Should personal users be able to invite family helpers (crew in a personal org)? Currently not allowed.
- Describe quota numbers per plan (proposed: free 50/day, company 2,000/day).
- Domain for invite links and App Links (`moverse.app`?), which depends on the trademark check.
- Should crew be able to delete items they created in the last N minutes, to fix mistakes on the spot?
