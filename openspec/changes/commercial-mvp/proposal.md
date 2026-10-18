# Commercial MVP — Moverse for moving companies

## Why

Moverse works end-to-end as a personal, single-tenant packing app (one Airtable base, one shared secret baked into the APK, sideload-only distribution). The decision has been made to commercialize it: **moving companies are the primary, recurring-revenue customers**, with occasional personal movers served by a friendly free tier that doubles as the acquisition funnel. None of the current backend, auth, distribution, or visual polish can serve paying strangers — Airtable cannot isolate tenants or handle concurrent crews, the shared `APP_SECRET` is committed to git, and there is no web presence for companies to sign up, pay, or show clients what was packed.

## What Changes

- **BREAKING** — Replace Airtable with a multi-tenant backend: Supabase (Postgres + Auth) for records and identity, Cloudflare R2 (S3-compatible, zero-egress) for photos. Tenant hierarchy: **org → job → boxes/items**. A personal user is an invisible org-of-one with a single auto-created job; a company sees jobs, a team, and a job switcher.
- **BREAKING** — Replace the shared `APP_SECRET` with per-user authentication (Supabase Auth JWTs) on every API call; rotate and retire the leaked secret.
- Add roles (owner/admin, crew) and crew onboarding via invite link / QR shown on the foreman's phone — crew lands directly in pack mode for one job.
- Add job management: jobs CRUD, job switcher in mobile, box/item codes scoped per job (DB sequences replace the O(n) Airtable table scans).
- Add a client-facing inventory report: shareable read-only web link (+ printable/PDF) per job with boxes, items, timestamped photos, and box check-off status (packed → loaded → delivered).
- Add a marketing/signup/billing website: landing page, Stripe subscription (per-active-job pricing for companies), free personal tier with limits. The app stays a free download where users log in (Slack model — no Play Billing).
- Protect the paid `/describe` endpoint: per-user daily quotas, rate limits, payload caps.
- Offline resilience for packing: queue saves locally and sync with retry (basements and storage units have no signal).
- Play Store distribution: release keystore, privacy policy + data-safety form, in-app account deletion, closed-testing track.
- **Design track**: establish a shared visual design system (tokens, typography, components) spanning the mobile app, the report web view, and the marketing site — produced with AI design tooling and Figma (AI-generated concept explorations → curated Figma library → implemented tokens), and a refinement pass over existing mobile screens against it.

## Capabilities

> Auth, provisioning, orgs/roles/invites, jobs, API security, the Supabase/R2 inventory port, code generation, account deletion and the Airtable migration are specified in the **`platform-foundation`** change. This change covers what builds on top of it.

### New Capabilities
- `client-report`: shareable read-only web report per job (boxes, items, photos, statuses) with revocable link and print/PDF layout.
- `billing-plans`: Stripe subscriptions on the web, per-active-job company pricing, free personal tier with enforced limits, plan gating in the API.
- `marketing-site`: public landing/signup site with pricing, Stripe Checkout hand-off, privacy policy and terms pages.
- `offline-capture`: local save queue with retry/sync and cached inventory for browsing without connectivity.
- `design-system`: shared visual language (color/type/spacing tokens, core components) applied across mobile, report view, and marketing site; Figma library as source of truth, AI tools for concept generation.

### Modified Capabilities
- `app-navigation`: navigation gains org/job context — job switcher for admins, locked single-job pack mode for crew, auth screens at the root.
- `apk-distribution`: distribution moves from sideloaded GitHub-Release APK to Google Play (release signing, closed testing, production).
- `item-capture`: saves go through the offline queue; capture flow works in crew mode with job pre-selected.
- `ui-consistency`: existing screens restyled to the new design-system tokens (refinement pass, no flow changes).

## Impact

- **Backend**: `lib/moverse.ts` and `api/*` are rewritten against Supabase (new schema, RLS policies) with photo I/O to an R2 bucket; Airtable and the Cloudflare `worker/` variant are retired. Vercel remains the API host (or moves to Supabase Edge Functions — design decision).
- **Mobile**: `mobile/src/api.ts`, `config.ts` (secret removed), navigation, and all screens touched by auth/jobs/design refresh; new auth, job-switcher, invite-join screens; NIIMBOT printing untouched.
- **New surfaces**: `web/` (report view + marketing/billing site) is a new app in the repo.
- **Dependencies**: Supabase, Cloudflare R2 (via the AWS S3 SDK), Stripe, a web framework (Next.js on Vercel), Sentry; Anthropic usage unchanged but quota-gated.
- **Data**: one-time migration of the existing personal Airtable base into the founder's org.
- **Security**: leaked `APP_SECRET` rotated immediately and removed from the client.
- **Distribution**: Play developer account, privacy policy URL, 12+ closed testers for 14 days (beta companies' crews satisfy this).
