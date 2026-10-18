# Commercial MVP — Tasks

## 1. Phase 0 — Groundwork (days, do first)

> 1.1 (rotate `APP_SECRET`) moved to `platform-foundation` 1.1.

- [ ] 1.2 Create Supabase projects (staging + production) and Cloudflare R2 buckets (staging + production); record Supabase URLs/keys and R2 endpoint/keys in Vercel env
- [ ] 1.3 Open the Google Play developer account (starts the identity-verification clock)
- [ ] 1.4 Set up Stripe account (test mode) and Sentry projects (mobile + web/API)
- [ ] 1.5 Recruit 2–3 beta moving companies and confirm their willingness to run one real job through the beta
- [x] 1.6 Repo restructure: create `web/` (Next.js app), `supabase/` (migrations), keep `api/` + `lib/`; retire `worker/` (leave deployable until parity confirmed)

## 2. Phase 1 — Backend: schema, auth, multi-tenant API

> Remaining backend work (auth, provisioning, roles/invites, RLS hardening, API port, photos, codes, describe quota, migration) moved to `platform-foundation` tasks 1–4 and 6.

- [x] 2.1 Write SQL migrations for `orgs`, `memberships`, `jobs`, `boxes`, `items`, `item_boxes`, `photos`, `invites`, `usage` with per-job `item_seq`/`box_seq` and indexes
- [x] 2.2 Add RLS policies enforcing org isolation on every table; write the cross-tenant CI test (user of org A cannot read org B via any path)

## 3. Phase 1 — Mobile: auth and tenancy

> Moved to `platform-foundation` tasks 5.x (auth, session, job context, join flow, team settings, account deletion) and 6.3 (dogfood).


## 4. Phase 2 — Offline capture

- [ ] 4.1 Durable save queue (persisted, ordered per job, client UUID idempotency keys) with background drainer + exponential backoff
- [ ] 4.2 Route capture saves through the queue; per-item queued/synced state and aggregate pending indicator with manual retry
- [ ] 4.3 Offline browse from cached job snapshot with offline indicator; refresh cache on successful fetches
- [ ] 4.4 Codeless-mode code-batch reservation and offline consumption; box-code reservation from the per-job sequence batch
- [ ] 4.5 Sync torture tests: airplane-mode packing session, duplicate-replay, app-kill mid-drain

## 5. Design track (runs parallel from Phase 1)

- [ ] 5.1 Generate 3+ divergent AI concept boards (report page, landing hero, Pack hub / Browse home / Item detail) and pick a direction
- [ ] 5.2 Curate the Figma library: color/type/spacing/radius tokens (light+dark), core components, reference layouts for report + landing + 3 mobile screens
- [ ] 5.3 Mirror tokens to code: refresh `mobile/src/theme.ts` and create the web CSS-variable/Tailwind theme with matching names
- [ ] 5.4 Mobile restyle pass: apply tokens across existing screens (states, spacing, empty states) with no flow changes
- [ ] 5.5 Design QA: compare implemented screens/pages against Figma references; fix drift

## 6. Phase 3 — Web app: report, dashboard, marketing, billing

- [ ] 6.1 Scaffold `web/` (Next.js on Vercel) with the design tokens and shared layout
- [ ] 6.2 Public report page `report/<token>`: boxes → items → photos (signed URLs), statuses, delivery summary, print stylesheet; token revocation honored
- [ ] 6.3 Report sharing in mobile: copy/share link, regenerate token (owners/admins)
- [ ] 6.4 Box lifecycle: status transitions packing → sealed → loaded → delivered in mobile (scan-driven check-off) reflected on the report
- [ ] 6.5 Landing + pricing pages; privacy policy and terms at stable URLs
- [ ] 6.6 Company web signup: account + org creation → Stripe Checkout (per-active-job subscription) → getting-started page
- [ ] 6.7 Stripe webhooks → org plan state; customer portal link; downgrade-on-cancel to free limits
- [ ] 6.8 Minimal org dashboard: team, jobs, invite links, billing state
- [ ] 6.9 Sentry wired in web/API and mobile; staging environment end-to-end (Vercel previews → staging Supabase)
- [ ] 6.10 Photo retention (D11): keep-while-subscribed, per-job/org export on cancel, grace-window purge of cold data; align with account deletion. (R2-IA storage tiering is deferred — triggered by a >~1 TB storage metric, not this milestone.)

## 7. Phase 3 — Play Store and beta

- [ ] 7.1 Generate upload keystore, enroll Play App Signing, add keystore secrets to CI; CI builds signed AAB (keep dev sideload APK workflow)
- [ ] 7.2 Play listing: assets, privacy-policy URL, data-safety form (photos, account data, AI processing), target-API compliance check
- [ ] 7.3 Closed-testing release; enroll beta companies' crews as testers (covers the 12-tester/14-day requirement)
- [ ] 7.4 Run 2–3 real beta jobs: crew invite → pack offline/online → client report shared; collect findings weekly
- [ ] 7.5 Validate per-active-job pricing with beta companies; set final Stripe products/prices
- [ ] 7.6 Beta fix cycle via OTA JS updates (EAS Update) + store builds as needed

## 8. Phase 4 — Launch

- [ ] 8.1 Production Play release after closed-testing requirements pass
- [ ] 8.2 Stripe live mode; marketing site public; personal free tier open
- [ ] 8.3 Decommission Airtable + `worker/` after parity sign-off; delete migration credentials
- [ ] 8.4 Post-launch checklist: backups/PITR verified on Supabase prod, quota/rate-limit dashboards, support email wired, uptime alerts
