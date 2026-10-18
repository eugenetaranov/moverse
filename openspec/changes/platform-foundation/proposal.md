# Platform foundation — auth, accounts, roles, Supabase migration

## Why

Every commercial feature (crew packing, client reports, billing) sits on three things Moverse does not have yet: real user identity, a tenant/role model the server enforces, and a datastore that can hold many companies. Today the app has one shared `APP_SECRET` (committed, and baked into public APKs) and one Airtable base. The `commercial-mvp` change sketches the whole product; this change carves out and fully designs the software foundation so it can be built and tested first, before any billing, web, or design work. The team review (2026-10-19) also found privilege-escalation holes in the first RLS draft (`0002_rls.sql`) and a duplicate-code risk when two phones work one job; both are fixed here.

## What Changes

- **Auth**: Supabase Auth with email OTP code (passwordless) and email + password for owners/admins; anonymous sign-in for crew, joined through an invite. Sessions persisted securely on device; sign-out clears all cached tenant data.
- **Account provisioning**: an idempotent bootstrap (`GET /me`, `provision_account`) creates a personal org + "My move" job, or a company org, right after signup. There is no fragile `auth.users` trigger.
- **Account structure and roles**: orgs → memberships (`owner` / `admin` / `crew`) → **job assignments** for crew. One permission matrix, enforced in the API *and* in RLS.
- **Invites**: job-scoped, expiring, revocable, use-limited tokens (stored hashed) shown as a QR. Consuming one creates the membership and job assignment atomically.
- **BREAKING — API auth**: every endpoint requires `Authorization: Bearer <JWT>` and a job context header. The `x-app-secret` path is deleted. The API calls Postgres *as the user* so RLS is a real second line, and the service role is confined to a small allow-listed module.
- **RLS hardening** (`0003_hardening.sql`): split read/write policies with role checks, composite FKs that make cross-tenant links impossible, server-built photo keys, plan and usage fields writable only by privileged paths, and a full pgTAP matrix in CI.
- **BREAKING — Inventory on Postgres**: `/save` and the browse/update/delete endpoints are ported to Supabase behind the current request shapes, with client-generated UUIDs so retries are idempotent. Multi-step writes run as Postgres RPCs (transactions).
- **Photos to R2**: direct-to-R2 presigned uploads (full + thumbnail), with photo rows created as `pending` and confirmed on save. Presigned GETs on read; orphan and deletion cleanup by cron.
- **Codes**: per-job atomic sequences plus **server-reserved code pools** on the device. These replace the single-device local counters (`reservation.ts`, `boxReservation.ts`).
- **Account deletion** (Play requirement): API flow with ownership rules and asynchronous R2 purge.
- **Data migration**: a re-runnable Airtable → Supabase/R2 import with a parity report and a cutover/rollback plan.
- **Environments and tests**: local (`supabase start`), staging (self-hosted on Proxmox or Cloud free), production (Supabase Cloud Pro, EU). The JWT verifier supports both signing setups. CI runs DB and API integration tests.

## Capabilities

### New Capabilities
- `user-auth`: sign-up/sign-in methods, sessions, anonymous crew identity, sign-out, auth gate in the app.
- `account-provisioning`: personal and company workspace creation, `/me` bootstrap, self-healing provisioning.
- `org-and-roles`: orgs, memberships, roles, crew job assignments, invites, member and ownership management.
- `job-management`: jobs CRUD/archive and the current-job context the app and API operate in (MVP-minimal).
- `api-security`: request authentication, authorization context, service-role confinement, RLS hardening, quotas and rate limits.
- `photo-storage`: R2 upload/serve/delete pipeline for item photos.
- `account-deletion`: user-initiated deletion with ownership rules and data purge.
- `data-migration`: Airtable → Supabase/R2 import, parity check, cutover.

### Modified Capabilities
- `inventory-store`: Postgres data model under org → job; idempotent `/save` via RPC; photos by reference. **BREAKING**
- `inventory-read-api`: job-scoped, user-authenticated reads and updates; photo URLs are R2 presigned. **BREAKING**
- `box-code-generation`: per-job sequences and server-reserved pools replace table scans and local counters.

## Relationship to `commercial-mvp`

This change **supersedes** the `commercial-mvp` deltas for `user-auth`, `org-and-roles`, `job-management`, `api-security`, `inventory-store`, `inventory-read-api` and `box-code-generation`, and its tasks 2.3–2.11 and 3.1–3.5. Those deltas should be removed from `commercial-mvp` before either change is archived, so the two don't conflict. `commercial-mvp` keeps billing, web/report, offline queue UX, design, and Play distribution.

## Non-goals

- Billing/Stripe, the web app and client report page, the marketing site, and the design system.
- The offline save queue UI and drainer (`offline-capture`). This change only provides the server contracts it needs: idempotent writes, code pools, and photo upload decoupled from save.
- iOS, social login (Google/Apple), SSO, and 2FA.
- A crew-lead role between admin and crew (open question).

## Impact

- **DB**: new migration `0003_hardening.sql` (schema + RLS changes), plus `0004_rpcs.sql` (domain and privileged RPCs) and `0005_cleanup.sql` (cron). `0001`/`0002` are not yet applied anywhere, so they may be edited instead if preferred.
- **API**: `lib/moverse.ts` is split into `lib/auth.ts`, `lib/db.ts`, `lib/privileged.ts`, `lib/r2.ts`, `lib/inventory.ts` and `lib/codes.ts`. New routes: `/me`, `/account/*`, `/jobs*`, `/invites*`, `/members*`, `/photos/upload-url`, `/codes/reserve`. New deps: `@supabase/supabase-js`, `jose`, `aws4fetch`.
- **Mobile**:
  - New: an auth stack, a `session.ts` and `apiClient.ts` (one fetch wrapper), a job context provider, and an invite scanner.
  - `reservation.ts` and `boxReservation.ts` are rewritten as pools.
  - `config.ts` loses `APP_SECRET`; `inventory.ts` caches are keyed by job.
  - New deps: `@supabase/supabase-js`, `expo-secure-store`, `expo-linking`, `expo-crypto`.
- **Ops**:
  - Custom SMTP for auth email (Resend or Postmark).
  - R2 buckets per environment.
  - Vercel cron.
  - GitHub Actions running `supabase start` for tests.
