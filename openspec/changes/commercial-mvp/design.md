# Commercial MVP — Design

## Context

Moverse today: Expo Android app → Vercel Edge Functions (`api/*` delegating to `lib/moverse.ts`) → Airtable (records + photo attachments) and Anthropic (`/describe`). One shared `APP_SECRET` in `mobile/src/config.ts` (committed to git) is the only gate. Codes (`ITM-nnnn`, `BOX-nn`) are minted by scanning the whole Airtable table. NIIMBOT B1 BLE printing is mature and stays as-is. Distribution is a debug-signed APK on GitHub Releases.

Target: moving companies as paying customers (crews, many concurrent jobs, client-facing proof of packing) with personal movers on a free tier that must feel like today's app — zero new concepts unless you're a company.

## Goals / Non-Goals

**Goals:**
- One codebase serving both segments via the org → job → boxes/items hierarchy, with the hierarchy invisible to solo users.
- Real per-user auth; the leaked shared secret rotated out and gone from clients.
- Crews can join and pack with near-zero friction (invite link/QR, no email ceremony).
- Companies can hand a client a link that shows exactly what was packed, per box, with photos and delivery check-off.
- Revenue via Stripe on the web (Slack model: app is a free login shell), free tier limits enforced server-side.
- Packing works offline; syncs when signal returns.
- Google Play production distribution.
- A coherent visual identity across mobile, report, and marketing site, built as tokens from a Figma source of truth.

**Non-Goals:**
- iOS (Expo keeps the door open; BLE printing unverified there — post-launch).
- In-app purchases / Play Billing (web billing only at MVP).
- Warehouse/storage features, barcode-SKU inventory, moving-company CRM (quotes, scheduling, dispatch).
- NIIMBOT protocol changes or new printer models.
- Real-time multi-device sync during packing (last-write-wins + refresh is acceptable at MVP).

## Decisions

### D1. Supabase for Postgres + Auth + RLS; Cloudflare R2 for photos
Supabase supplies the relational database, user auth (email/password + magic link), and row-level security for tenant isolation — the identity + structured-data layer, which stays small and cheap (text rows, generous free MAU). Photos live in **Cloudflare R2**, not Supabase Storage. Rationale: photo serving (gallery browse, client-report views) is the only part of the workload with real volume, and it is *egress-dominated*; R2 charges **zero egress** (vs S3 ~$0.09/GB and Supabase's tight 1 GB storage / 5 GB egress free-tier caps that a handful of real jobs would exhaust). R2 speaks the S3 API, so the app uses the standard AWS S3 SDK with presigned URLs — no lock-in, portable to S3 later by swapping the endpoint. Decoupling photos from Supabase keeps the two cost curves independent: Supabase Pro's flat $25/mo covers DB+auth as customers grow, while photo storage/egress scales on R2 at ~$0.015/GB with no egress line item.

Alternatives: Supabase Storage for photos (one fewer vendor, but its free-tier storage/egress caps make it a cost cliff exactly where this app grows — rejected); S3 + CloudFront (works, and CloudFront's 1 TB/mo free egress is fine early, but it's two services to wire — bucket + CDN + edge signed-URL config — vs R2's single product; kept as the drop-in fallback since the SDK is identical); Neon+Clerk (more vendors to integrate for the same result); Firebase (NoSQL fits the relational job/box/item model poorly); Airtable base-per-customer (unmanageable provisioning, 5 rps/base, token sprawl — rejected in analysis). RLS is the tenant boundary: every table carries `org_id` (directly or via `job_id`), policies enforce membership, so even a leaked anon key + JWT only reaches the caller's org.

Cost shape (why the free tier isn't the plan): Supabase free (500 MB DB / 1 GB storage / 5 GB egress, projects pause after ~1 week idle) is for founder dogfooding and beta only. The moment companies pay, the org is on Supabase **Pro ($25/mo flat, no pausing)**; photos never touch Supabase's caps because they're on R2. Storage/egress is then a cost of goods the per-active-job pricing absorbs.

### D2. Keep Vercel functions as the API layer, rewritten over Supabase + R2
The mobile app keeps calling the same endpoint shapes (`/save`, `/describe`, `/items`, `/boxes`, ...) with `Authorization: Bearer <supabase JWT>` replacing `x-app-secret`. `lib/moverse.ts` is rewritten against `supabase-js` (service role, with explicit org/job scoping derived from the verified JWT — the API is the one place scoping logic lives). Photo I/O goes through the S3 SDK against R2: on `/save` the API uploads the JPEG to R2 and records the object key in the `photos.storage_path` column; reads (`/items`, the client report) return short-lived R2 **presigned GET URLs** generated at render time (the same short-lived-URL pattern the app already expects from the Airtable era). Anthropic (`/describe`), quota enforcement, plan gating, and code minting all need this trusted layer anyway, so mobile never talks to Supabase or R2 directly — one API layer owns all scoping and all credentials (Supabase service key, R2 keys, Anthropic key).

### D3. Schema
```
orgs            id, name, kind ('company'|'personal'), plan, stripe_customer_id, created_at
memberships     org_id, user_id, role ('owner'|'admin'|'crew'), created_at
jobs            id, org_id, name, client_name, status ('active'|'archived'), item_seq, box_seq, report_token, created_at
boxes           id, job_id, code, type, destination, name, status ('packing'|'sealed'|'loaded'|'delivered'), created_at
items           id, job_id, code, description, created_at
item_boxes      item_id, box_id            -- an item may span boxes (existing behavior)
photos          id, item_id, storage_path, created_at   -- storage_path = R2 object key
invites         id, org_id, job_id?, role, token, expires_at, created_by
usage           org_id, day, describe_count -- /describe quota accounting
```
Codes are minted from `jobs.item_seq` / `jobs.box_seq` via `UPDATE ... RETURNING` — atomic, per-job, race-free, O(1). Personal signup auto-creates `orgs(kind='personal')` + one job named "My move"; the mobile UI hides org/job chrome when `kind='personal'` and there is exactly one active job.

### D4. Crew onboarding: invite link with embedded token, QR-presentable
Admin creates an invite scoped to a job with role `crew`; the app renders it as a QR the crew member scans with the Moverse app (or a link that deep-links). Joining creates a lightweight account (name only; email optional — Supabase anonymous sign-in upgraded later) and a `crew` membership. Crew sessions land locked to that job's pack mode: capture, print, and view of that job only — enforced by API scoping, not just UI. Rationale: crews wear gloves and churn; email verification at the truck is a non-starter.

### D5. Client report: public tokenized read-only page
Each job has a `report_token` (revocable/regenerable). `web/report/<token>` renders boxes → items → photos + statuses, server-side (Next.js), with a print stylesheet for PDF. No client account needed. Photos are served as short-lived R2 presigned GET URLs minted at render time (never public bucket URLs). Alternative — emailed PDFs — rejected: a live link stays current through delivery check-off and is the shareable artifact companies forward.

### D6. Web: one Next.js app on Vercel for marketing + billing + report
Single `web/` app: landing + pricing pages (static), Stripe Checkout + customer portal for subscription management, authenticated org dashboard (minimal at MVP: team, jobs, invites, billing state), and the public report route. Pricing: **per active job** for companies (matches how they think about cost; archive = stop paying), personal tier free with server-enforced limits (1 active job, item cap, `/describe` daily cap). Stripe webhooks update `orgs.plan`; the API reads `plan` to gate. No Play Billing anywhere.

### D7. Offline capture: durable local queue
Saves (item + photos) append to a persisted queue (AsyncStorage/SQLite) and a background drainer syncs with retry + backoff; the UI shows queued/synced state per item. Item codes in coded mode come from the physical label (safe offline); codeless mode reserves a code batch per job ahead of time so offline minting can't collide. Inventory browse reads a cached snapshot when offline. Conflict policy: last-write-wins (MVP; packing is mostly append-only so conflicts are rare).

### D8. Design track: AI-explore → Figma-curate → tokens-implement
1. Generate divergent visual directions with AI tools (concept boards for the report page, marketing hero, and 3 key mobile screens).
2. Curate the chosen direction into a small Figma library: color/type/spacing/radius tokens, core components (button, card, list row, status chip, sheet), and the report + landing layouts.
3. Export tokens to code once (`theme.ts` for mobile — it already centralizes styling; CSS variables/Tailwind config for web) — Figma is the source of truth, code holds a mirrored token file; no automated sync pipeline at MVP.
4. Mobile refinement is a restyle pass (tokens, spacing, states) over existing screens — flows do not change.

### D9. Observability and environments
Sentry in mobile and web/API from the first beta build. Separate Supabase projects and separate R2 buckets for staging and production; Vercel preview envs point at staging. EAS Update (or expo-updates OTA) for JS-level mobile fixes during beta without full store review.

### D10. Migration of existing data
One-time script: Airtable export → founder's org ("Eugene", personal) with one job holding current boxes/items; photos downloaded from Airtable attachments and re-uploaded to R2 (recording each object key in `photos.storage_path`). Airtable then frozen read-only, deleted after beta confirms parity.

### D11. Photo retention and storage tiering (designed-for, not built at MVP)
Retention policy: a job's photos are kept while its org is subscribed; on cancellation the org keeps read/export access for a grace window (e.g. 30 days) and can export a job's photos + report, after which cold data may be purged. This is a privacy/Play-compliance answer (bounded retention, user-triggerable deletion) as much as a cost one — it caps long-tail storage and pairs with in-app account deletion (`user-auth`).

Tiering: at MVP everything stays on **R2 Standard** — at-rest storage is negligible until multi-TB (~$0.015/GB-mo; a few hundred GB is single-digit dollars/month), so cold-storage optimization now would add complexity to save nothing. When archived-job photos cross ~1 TB, transition them via an **R2 bucket lifecycle rule to R2 Infrequent Access** (cheaper at rest, small retrieval fee, still zero egress, *fast* retrieval). Fast retrieval matters here: photos are pulled during claims disputes weeks-to-months post-move, so a deep-freeze tier is the wrong shape for the access pattern.

Why not S3 Glacier / cross-cloud cold storage: Glacier Deep Archive is ~15× cheaper at rest but thaws in hours with per-GB retrieval fees — bad UX at exactly the claims moment — and splitting hot-R2 / cold-S3 adds a second provider, credentials, and a retrieval-on-demand path for savings that only matter at many TB. Kept open as a far-future option: it sits behind the same `photos.storage_path` abstraction, so it needs no schema or API-shape change.

Headroom, no Phase-1 work: the tiering hook is a nullable `storage_class` column on `photos` (added when first needed) plus an R2 lifecycle rule — both additive. All photo I/O already flows through the one API layer, so which tier an object lives in is invisible to mobile and web. Nothing about tiering is implemented at MVP; the transition is triggered by a storage metric, not a milestone.

## Risks / Trade-offs

- [Backend rewrite breaks working flows] → Port endpoint-by-endpoint behind the same request/response shapes; write handler tests against the current contract first; founder dogfoods staging with the migrated real base before any beta user touches it.
- [RLS misconfiguration leaks tenant data] → Service-role access confined to the API layer with scoping derived from verified JWT in one shared helper; RLS as second line; an automated test that a user of org A cannot read org B by any endpoint.
- [Crew "no-email" accounts get orphaned/abused] → Invites expire, are single-role, job-scoped, and revocable; crew accounts can't create jobs or see billing.
- [Per-active-job pricing may not land with companies] → Validate with 2–3 beta companies before wiring the final Stripe products; Stripe price objects make repricing cheap.
- [Offline queue sync bugs corrupt inventory] → Queue is append-only with idempotency keys (client-generated item UUIDs); server upserts on that key so retries can't duplicate.
- [Google Play new-account requirements delay launch] → Open the dev account and start the 12-tester/14-day closed test at the *start* of beta, not after; beta companies' crews are the testers.
- [Design track stalls engineering] → Tokens land early (D8 step 3) so implementation proceeds; screen-level polish is a trailing, non-blocking pass.
- [`/describe` cost abuse] → Per-org daily quota in `usage` table, request payload cap (~1.5 MB), per-IP rate limit on unauthenticated routes.
- [Photo storage/egress cost grows with usage] → Photos on R2 (zero egress, ~$0.015/GB storage) so serving cost stays flat and predictable; keep the ~1024px JPEG downscale (≈200 KB/photo); presigned URLs cached client-side per session to cut repeat GETs; bounded retention + R2-IA tiering above ~1 TB (D11) cap long-tail storage.
- [Cross-cloud data path (Supabase + R2)] → Both accessed only from the one API layer via well-supported SDKs (`supabase-js`, AWS S3 SDK); R2 is S3-compatible so it is swappable for S3 with an endpoint change if Cloudflare ever disappoints.
- [Leaked APP_SECRET in git history] → Rotate immediately (day 1, independent of everything else); old sideload APKs stop working — acceptable, single known user.

## Migration Plan

1. **Phase 0 (days)**: rotate `APP_SECRET`; create Supabase staging/prod projects and R2 staging/prod buckets; open Play dev account; recruit 2–3 beta moving companies.
2. **Phase 1 (3–5 wks)**: schema + RLS; port API to Supabase + R2 photo I/O; auth in mobile; orgs/roles/invites; per-job sequences; `/describe` protection; data migration script; retire `worker/`.
3. **Phase 2 (2–3 wks, overlaps)**: mobile job switcher + crew mode + auth screens; offline queue; account deletion; design tokens land; screen restyle pass.
4. **Phase 3 (2–3 wks, overlaps)**: `web/` app — report page first, then landing + Stripe; Sentry; Play closed testing with beta crews.
5. **Phase 4**: production Play release, Stripe live mode, marketing site public. Rollback within beta = point mobile back at the frozen Airtable worker (kept deployable until parity confirmed).

## Open Questions

- Per-active-job price point (validate in beta; also whether personal ever gets a paid tier).
- Anonymous crew accounts vs. requiring email at join (Supabase anonymous auth is simplest; abuse surface acceptable?).
- Exact retention grace window and export format after cancellation (D11 sets the shape; the number and whether export is per-job or whole-org need a beta/legal call).
- Whether the org dashboard on web needs job/inventory browsing at MVP or stays team+billing only.
- Domain/brand check: is "Moverse" clear for trademark and app-store listing in target markets?
