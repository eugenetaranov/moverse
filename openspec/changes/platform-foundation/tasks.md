# Platform foundation — Tasks

## 1. Groundwork

- [ ] 1.1 Rotate the leaked `APP_SECRET` in Vercel and stop shipping it: read it from EAS env until auth lands (D6)
- [ ] 1.2 Add gitleaks (pre-commit + CI step)
- [ ] 1.3 `supabase init`; check `config.toml` into git, with email OTP, anonymous sign-ins, password policy and SMTP placeholders (D2)
- [ ] 1.4 Create the staging environment (self-hosted on Proxmox via Cloudflare Tunnel, or Cloud free) and the prod environment (Cloud Pro, EU); create R2 buckets `moverse-dev`/`-staging`/`-prod`; configure custom SMTP (D1)
- [ ] 1.5 `ci.yml`: typecheck, `supabase start`, `db reset`, `test db` and the API tests, required for merge (D16)

## 2. Database

- [ ] 2.1 `0003_hardening.sql` (D7):
    - `job_members`
    - composite keys on `item_boxes`/`photos`
    - photo status, thumbnail and key constraint
    - `created_by`, `code_seq` and box status timestamps
    - client-supplied item ids
    - invite `token_hash`, `max_uses`, `uses`, `revoked_at`
    - index cleanup
- [ ] 2.2 Replace the `0002` policies with per-command policies and column grants per the D7 table; add the helpers `org_role`, `can_access_job` and `accessible_job_ids`
- [ ] 2.3 `0004_rpcs.sql` privileged RPCs: `provision_account`, `create_invite`, `consume_invite`, `set_member_role`, `remove_member`, `assign_job`, `transfer_ownership`, `leave_org`, `regenerate_report_token`, `consume_describe_quota`, `account_deletion_plan`
- [ ] 2.4 `0004_rpcs.sql` inventory RPCs: `save_item`, `update_item`, `update_box`, `delete_items`, `move_items`, `reserve_codes`, `create_pending_photo`, `attach_photos` (D9, D12)
- [ ] 2.5 `storage_deletions` outbox, populated by triggers when photos, items, jobs or orgs are deleted (D8)
- [ ] 2.6 `0005_cleanup.sql`: `pg_cron` purge of membership-less anonymous users after 24 h, and the expired-pending-photo sweep that queues deletions
- [ ] 2.7 pgTAP role × table × command matrix with explicit escalation cases, plus RPC behaviour tests (D16)
- [ ] 2.8 Seed script for local and staging: two orgs with owner, admin, assigned and unassigned crew, and an outsider

## 3. API core

- [ ] 3.1 Contract tests captured against the current Airtable implementation for `/save`, `/items`, `/boxes`, `/item-update`, `/box-update` and the deletes (baseline)
- [ ] 3.2 `lib/auth.ts`: JWT verification with `jose` (JWKS + HS256), user-scoped supabase client, `withAuth` with job context and `minRole`, error mapping (D6); delete `guard()` and the `x-app-secret` path
- [ ] 3.3 `lib/privileged.ts` behind an ESLint `no-restricted-imports` allowlist
- [ ] 3.4 `lib/r2.ts` with aws4fetch: presign PUT/GET, HEAD, batch delete (D8)
- [ ] 3.5 Integration test harness: Vitest + local Supabase + MinIO, with helpers that sign in seeded users

## 4. API endpoints

- [ ] 4.1 `GET /me` with self-heal provisioning, and `POST /account/provision` (D4)
- [ ] 4.2 `/jobs` (GET, POST) and `/job-update` (rename, archive, unarchive)
- [ ] 4.3 `/invites` (list, create), `/invite-revoke`, `/invites/consume` (D5)
- [ ] 4.4 `/members`, `/member-update` (role, remove, assign or unassign job), `/org-transfer`
- [ ] 4.5 `/photos/upload-url` (D8)
- [ ] 4.6 Port `/save` to `save_item` with `photoIds[]` and object HEAD verification
- [ ] 4.7 Port `/items` and `/boxes` (presigned URLs, sorting by `code_seq`), `/item-update`, `/box-update`, `/item-add-photo`, `/item-delete`, `/box-delete`; the contract tests from 3.1 pass
- [ ] 4.8 `/codes/reserve`; `/next-code` and `/next-box-code` as compatibility wrappers (D12)
- [ ] 4.9 `/describe`: content-length cap and `consume_describe_quota` (D11)
- [ ] 4.10 `/account/delete` (D14) and `/account/profile`
- [ ] 4.11 `/api/cron/storage` (drain `storage_deletions`, every 10 min) with the Vercel cron secret
- [ ] 4.12 Vercel WAF rate-limit rules for `/invites/consume`, `/account/provision` and `/api/*`; `vercel.json` rewrites for the new routes

## 5. Mobile

- [ ] 5.1 `app.config.ts` with per-profile `API_URL`, `SUPABASE_URL` and `SUPABASE_ANON_KEY`; remove `APP_SECRET` from `config.ts`
- [ ] 5.2 `session.ts`: supabase-js auth with the LargeSecureStore adapter and AppState-driven auto refresh (D2)
- [ ] 5.3 `apiClient.ts`: a single fetch wrapper (Bearer token, `X-Moverse-Job`, refresh-and-retry on 401, typed errors); migrate `api.ts` and `inventory.ts` onto it
- [ ] 5.4 Auth stack: Welcome → Email → Code / Password → Personal or Company (+ org name) → provision → `/me`; auth gate in `App.tsx`
- [ ] 5.5 `JobContext`: `/me` state, current org and job persisted per user, chrome rules, a job switcher sheet, "Create your first job" for new companies (D10)
- [ ] 5.6 Scope `inventory.ts` caches by job; wipe all of the user's local state on sign-out
- [ ] 5.7 Photo upload path: thumbnail generation, `/photos/upload-url`, PUT to R2, `/save` with `photoIds`; client UUIDs for items and photos
- [ ] 5.8 `codePool.ts` replaces `reservation.ts` and `boxReservation.ts`, with a persisted pool per job and kind and background refill (D12)
- [ ] 5.9 Join flow: `moverse://j/` and `https://<domain>/j/` deep links, an in-app "Join a team" scanner, the display-name step, anonymous sign-in, consume, then land in the locked job
- [ ] 5.10 Settings: profile (display name, add email for crew), team (members, invites with QR, revoke, assign jobs) for owners and admins, "Start a company", sign out, delete account
- [ ] 5.11 Unit tests: `codePool`, `apiClient` refresh path, job-context persistence

## 6. Migration and cutover

- [ ] 6.1 `scripts/migrate-airtable.ts`: deterministic UUIDs, box and item import, photo download, thumbnails and upload to R2, sequence repair (D15)
- [ ] 6.2 Parity report that exits non-zero on any difference
- [ ] 6.3 Staging run, then founder dogfooding on a staging build, then fix gaps
- [ ] 6.4 Prod cutover: freeze Airtable, final import with a clean report, ship the mobile build, keep the old deployment and the base for 30 days
- [ ] 6.5 Remove the superseded deltas and tasks (2.3–2.11, 3.1–3.5) from the `commercial-mvp` change
