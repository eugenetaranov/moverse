# Moverse launch plan

Status: draft, 2026-11-11. This plan combines five research reports (pricing PM, business-ops PM, mobile release engineer, platform engineer, payments engineer). The reports are in [`research/`](./research) and carry the sources and detail.

**Goal:** paid B2B launch for moving companies, with a free tier for personal movers. Live on Google Play and the App Store, with web billing through Stripe, about **14 weeks** from today (target mid-February 2027).

## 0. Decisions needed before week 1

| # | Decision | Recommendation | Why it blocks |
|---|---|---|---|
| D1 | **Country of the legal entity** | Register where you live (EU company, or an Estonian OÜ via e-Residency). Use a US Delaware LLC through Stripe Atlas only if you're selling mainly to the US | Determines VAT handling, the bank, Stripe vs Paddle, and the seller name shown in the stores |
| D2 | **Keep the name "Moverse"?** | Pay for a 1-hour trademark clearance (€300–500) before spending on branding | moverse.com and moverse.app are taken. moverse.ai (Greek AI startup), a "Moverse" fitness app on iOS and a Korean startup all use the name |
| D3 | **Domain** | Register **getmoverse.com** now through Cloudflare Registrar, and watch moverse.io (appears lapsed) | Needed for email, D-U-N-S, store listings, deep links and Stripe. The DNS plan in the design assumed moverse.app, which is taken |
| D4 | **Hosting** | **Keep Supabase Cloud Pro (EU) + Cloudflare R2 + Vercel.** Use DigitalOcean App Platform only as a fallback for `api/` and `web/` if Vercel cost or limits bite | See §4. DO Managed Postgres would mean rewriting auth and RLS (high effort, more ops) for no cost saving at this scale |
| D5 | **iOS at launch?** | Yes, ship on both stores. Apple enrollment runs in parallel and the code fixes are small | `commercial-mvp` currently lists iOS as a non-goal. Update the spec if you agree |
| D6 | **Mobile app/bundle ID** | Decide before the first store upload; both IDs are permanent. `me.taranov.moverse` is personal. A company ID like `com.getmoverse.app` is better if a company owns the app | Can't be changed after publishing |

## 1. The team and who owns what

Solo founder, with each role as a hat. The research reports are each role's working brief.

| Role | Owns |
|---|---|
| **Product PM** | Plans and pricing, beta recruitment, onboarding, KPIs, store listing copy |
| **Business-ops PM** | Company entity, bank, D-U-N-S, trademark, legal documents, accounts register, insurance and bookkeeping |
| **Platform engineer** | `platform-foundation` (auth, Supabase, R2), environments, DNS and email, CI/CD, backups, security |
| **Mobile release engineer** | Expo SDK upgrade, iOS port, EAS pipeline, both store submissions, deep links |
| **Payments engineer** | Stripe products, billing webhooks, plan limits in the API, invoicing and tax |

## 2. Timeline

Two tracks run in parallel. On the business track, the slowest steps are **the entity → D-U-N-S number → Apple and Google enrollment**. On the engineering track, it's **the Expo SDK upgrade plus `platform-foundation`**.

### Weeks 0–1: Start the long lead-time items
- **Business:**
  - Decide D1–D3.
  - Register getmoverse.com.
  - Set up a password manager and a Google Workspace (about $7/user/mo) with support@, privacy@, billing@ and dev@ aliases.
  - Start forming the entity.
  - Book the trademark clearance.
- **Engineering:**
  - **Rotate the leaked `APP_SECRET` today.**
  - Scan git history (gitleaks) and rotate any other exposed keys.
  - Start a branch for the **Expo SDK 52 → current SDK** upgrade. Without it neither store accepts builds: Apple requires Xcode 26 since Apr 2026 and Play requires API 36 since Aug 2026. Afterwards, re-check react-native-ble-plx on a real NIIMBOT B1.
- **Product:** start recruiting 2–3 beta moving companies (5–30 crew each, at least one in the EU).

### Weeks 1–5: Foundation
- **Business:**
  - Entity formed, then open a bank account (Wise/Mercury).
  - **Request D-U-N-S the same day** (free; Google warns it can take up to 30 days).
  - Generate the Privacy Policy, Terms and Cookie Policy (Termly or iubenda).
  - Sign the DPAs with Supabase, Cloudflare, Anthropic, Stripe, Sentry and Postmark.
- **Platform:**
  - Implement `platform-foundation`: auth, provisioning, roles and invites, RLS hardening, inventory on Postgres, R2 photos, code pools, account deletion, the Airtable migration.
  - Set up Cloudflare DNS, Postmark SMTP with SPF/DKIM/DMARC, Sentry, uptime checks, and CI with `supabase start`.
- **Mobile:**
  - Finish the SDK upgrade and set up EAS Build/Submit profiles (development / preview / production).
  - iOS fixes:
    - wait for the BLE `PoweredOn` state before scanning
    - add the `bluetoothAlwaysPermission` string
    - set the bundle ID
    - default to `writeAck` on iOS

### Weeks 4–9: Commercial features
- **Store accounts:** as soon as the D-U-N-S number arrives, enroll in **Apple ($99/yr, organization; budget 3–4 weeks)** and **Google Play ($25 one-time, organization)**.
- **Web (`web/`, Next.js):**
  - Build the client report page first.
  - Then the landing and pricing pages, Terms/Privacy/refund pages, and the public account-deletion page (Play requires one).
  - Add the `/j/<token>` invite landing and the `.well-known/assetlinks.json` and `apple-app-site-association` files.
- **Payments (Stripe test mode):**
  - Products and prices.
  - Checkout and Customer Portal.
  - Webhooks.
  - The `plan_limits` table and the shared limit check in the API.
  - Usage-based job counting (§3).
- **Mobile:** job switcher, crew mode, offline queue, and a restyle to the design tokens.

### Weeks 8–12: Closed beta
- Beta companies' crews on Play's closed track and TestFlight (internal, then external).
  - Our organization account is exempt from Play's 12-tester / 14-day rule, but we run the closed beta anyway.
- Founder dogfoods staging with the migrated real data first.
- Validate pricing with the beta companies:
  - Does charging per active job make sense to them?
  - How many jobs are active at once?
  - How many items get AI descriptions?
  - Do clients open the report?
- Pay a lawyer once for the B2B **DPA plus Terms** (€1.5–5k) before the first paying customer.
- Run a backup restore drill and write the incident runbook.

### Weeks 12–14: Launch
- Switch Stripe to live mode. Stripe needs:
  - the entity and its bank account
  - a website showing pricing, Terms, Privacy and refund policy
  - live webhooks and products recreated with `lookup_key`
  - a real-card purchase and refund test
- Submit to the stores:
  - Apple usually reviews in 1–3 days, up to 5 for a first release.
  - Play can take 7–14 days for a new account.
  - Give reviewers a **password-login demo account** with a seeded company and job.
  - Fill in the data-safety form and the privacy nutrition labels: photos and text are sent to Anthropic.
- Make the marketing site public and convert the beta companies to paid.

## 3. Pricing and payment plans

**Model:** flat tiers that each include a number of active jobs, plus a fee per extra job. Moving companies already pay $100–400/mo for their main software and are used to per-job pricing (Voxme about $3/job, Encircle about $17/job). Per-seat pricing would penalise inviting crews, which is the core flow.

| | Free (personal) | Starter | Pro | Fleet |
|---|---|---|---|---|
| Monthly price | $0 | $49 / €49 | $149 / €149 | from $399, by quote |
| Active jobs included per month | 1 | 5 | 20 | 60+ |
| Each extra job | – | $8 | $6 | $4 |
| Admins / crew | 1 + 2 helpers | 2 / unlimited | 10 / unlimited | unlimited |
| AI descriptions per month | 50 | 3,000 | 12,000 | 40,000 |
| Photo storage | 2 GB | 25 GB | 100 GB | 500 GB+ |
| Client report | Moverse-branded | Company logo | Logo, colours, PDF | White-label, custom domain |

- **Trial:** 14 days of Pro, no card needed. A company that doesn't subscribe drops to Free and its jobs become read-only.
- **Beta companies:** 3 months free, then 30% off for 12 months, in return for feedback and a case study.
- **Annual billing:** not at launch. The extra-job charges are billed after the month ends, so an annual plan would bill them a year later. Add it later as a prepaid job bundle at about 20% off.
- **Running out of AI descriptions never stops packing.** Photo-only capture keeps working, and a top-up costs $10 per 1,000.
- **Single Move Pass:** $19 for one job and 120 days, **web only, after launch.** It fits how personal movers buy, but Apple's multiplatform rule makes a web-only consumer purchase a review risk once there's an iOS build.
- **Cancellation:**
  - Full access to the end of the paid period.
  - Then **60 days read-only** with export (PDF report plus a ZIP of photos), then deletion. This replaces the 30 days in D11, because damage claims arrive months after a move.
  - Archived jobs keep their photos for 24 months while the company is subscribed.
- **Unit economics:**
  - A typical job costs about **$1.25** to run, almost all of it AI descriptions at about $0.003 per item.
  - Gross margin is **73–80%** even if every included AI description is used, and 85–90% at typical usage.
  - Fixed infrastructure costs are covered by about 3 Starter customers.

### How payments work
- **Provider: Stripe Billing + Stripe Tax**, about 4.1% all-in on domestic cards. The alternatives are merchant-of-record services, which act as the legal seller and handle sales tax: Paddle, Lemon Squeezy and Polar, at about 5% + 50¢. Mostly-B2B sales in the EU fall under reverse charge, which keeps VAT simple. **Switch to Paddle** only if Stripe doesn't support the entity's country, or you want zero tax admin.
- **Stripe setup:**
  - A flat **base price** per plan.
  - A **usage-based price**, where the unit is an "active job-period": each job counts once per billing period if it was active at any time.
  - Graduated tiers make the included jobs free.
  - Jobs are recorded in `billable_job_periods` with a unique constraint and the Stripe event identifier `job_id:period`, so a job can't be counted twice. A nightly job reconciles the database against Stripe.
- **Plan limits:**
  - Add `subscription_status`, `current_period_end` and `stripe_subscription_id` to `orgs`.
  - Add a `plan_limits` table.
  - Enforce the limits in one shared check in the API.
  - Only the webhook writes plan state.
- **Webhooks:**
  - Events:
    - checkout completed (including the async SEPA/ACH success and failure events)
    - subscription created, updated and deleted
    - invoice paid and payment failed
    - payment action required
    - trial ending
    - dispute created
  - Process each event once (an `stripe_events` table) and re-fetch the subscription from Stripe instead of trusting the payload order.
- **Failed payments:** Stripe's Smart Retries. Status `past_due` gets a 14-day grace period, then the company drops to Free with its data kept.
- **B2B invoicing:**
  - Collect VAT IDs at checkout. Stripe checks them against VIES and applies reverse charge automatically.
  - Invoice PDFs are generated automatically.
  - Payment methods: card, **SEPA Direct Debit**, ACH, and invoice with bank transfer for larger customers.
- **App stores:**
  - **No prices, buy buttons or checkout links in either app.** Users pay on the web, and the app is just the login (like Slack).
  - When a limit is hit, show neutral text such as "Ask your account owner", with no link.
  - Apple 3.1.3(c) (subscriptions sold directly to businesses) covers company plans.
  - Revisit US-only checkout links after the Supreme Court rules on Apple v. Epic (No. 25-1311).
- **Spec follow-up:** reword the `commercial-mvp` billing-plans scenario "Billing follows active jobs" to use the job-period unit.

## 4. Hosting and infrastructure

| Topology | Beta (≈5 companies) | Growth (≈100 companies, 2 TB photos) | Verdict |
|---|---|---|---|
| **Vercel + Supabase Cloud Pro + R2** (current design) | ≈ $45–50/mo | ≈ $130–250/mo | **Use this.** Lowest ops burden, and auth, backups and upgrades are managed |
| DO App Platform + DO Managed PG + separate auth | ≈ $50–55/mo | ≈ $210–250/mo | High migration effort: new identity layer, rewritten RLS helpers, changes to mobile sign-in |
| Self-hosted Supabase on a DO/Hetzner VM | ≈ $62/mo | ≈ $130/mo + your time | You become the on-call database admin. Only if a customer demands EU-sovereign hosting |

- **Fallback:** move `api/` and `web/` to DO App Platform ($12–24/mo) if Vercel limits bite. The handlers use Web-standard Request/Response, so wrapping them in Hono is a small port. Photos stay on R2: it has no download fees, while DO Spaces charges for transfer.
- **DNS (Cloudflare), with getmoverse.com as the domain:**
  - The apex domain serves marketing, pricing, billing, the `/j/<token>` invites and `.well-known`.
  - `api.` for the API.
  - `r.` for client reports.
  - `auth.` as a custom domain for Supabase, so the URL built into the apps survives a provider move.
  - Staging sits behind Cloudflare Access.
- **Email:** Postmark ($15/mo) as Supabase's SMTP for sign-in codes. Start DMARC at `p=none` and tighten it to `reject` over about 4 weeks.
- **Ops:**
  - Sentry for mobile, web and API.
  - Better Stack for uptime checks and phone alerts.
  - Weekly `pg_dump` to an R2 bucket with object lock, and a quarterly restore drill.
  - Production deploys are gated in GitHub Environments.
- **Security before launch:**
  - Rotate `APP_SECRET`.
  - Run gitleaks in CI.
  - RLS tests for cross-company access and crew privilege escalation.
  - R2 presigned links expire in 15 minutes or less.
  - Cloudflare WAF rate limits on `/describe`, `/invites/consume` and `/account/*`.
  - 2FA with a hardware key on every vendor account.

## 5. Accounts register (all owned by the company, using role@ addresses, 2FA, recovery codes in the password manager)

| Account | Cost | When |
|---|---|---|
| Password manager (1Password/Bitwarden) | ~$4–8/mo | Week 0 |
| Cloudflare: registrar, DNS, R2, WAF | ~$10/yr domain; R2 ≈ $0 at beta | Week 0 |
| Google Workspace | ~$7/user/mo | Week 0 |
| Legal entity + bank (Wise/Mercury) | €100–1,000 (EU) or $500 + $400/yr (Delaware) | Weeks 0–3 |
| D-U-N-S (Dun & Bradstreet) | Free | Right after the entity exists |
| Apple Developer Program (organization) | $99/yr | Once D-U-N-S arrives |
| Google Play Console (organization) | $25 one-time | Once D-U-N-S arrives |
| Expo / EAS (Starter) | $19/mo | Week 1 |
| Supabase Pro (EU) | $25/mo + compute | Before beta (free plan for development) |
| Vercel Pro | $20/mo | Before beta |
| Postmark | $15/mo | Week 2 |
| Stripe | ~4.1% per transaction | Test mode from week 4; live at launch |
| Anthropic API | Usage, with a spend limit set | Exists; rotate the key |
| Sentry, Better Stack | Free tiers | Week 2 |
| GitHub organization | Free | Move the repo from the personal account before launch |
| Termly/iubenda + lawyer (DPA and Terms) | ~$15/mo + €1.5–5k once | Weeks 2 and 10 |
| Trademark (EUIPO, 1 class) | €850 + clearance €300–500 | After D2 |
| Insurance (tech errors and omissions + cyber) | ~$500–1,500/yr | Before the first paid customer |

**Run cost at beta:** about **$100/mo** plus AI usage. **One-off costs to launch:** about **$2.5k–8k**, mostly legal, entity and trademark.

## 6. Go-to-market and KPIs

- **Channels:**
  - An "Inventory by Moverse" footer on every client report (the built-in growth loop).
  - Moving trade associations: AMSA ProMover, BAR, FIDI.
  - SEO on moving inventory and claims.
  - Short videos of QR scan → box contents.
  - A NIIMBOT affiliate link or bundle.
  - Later, integration listings next to SmartMoving and Supermove.
- **KPIs:**
  - Company activation (first job, crew invited, 50+ items in 7 days): target ≥ 60%.
  - Trial-to-paid conversion: 15–25%.
  - Monthly churn: < 3%.
  - Net revenue retention: > 100%.
  - Client report open rate.
  - AI cost per job.
  - Free-to-Pass conversion: 3–5%.

## 7. Spec changes this plan implies

- `commercial-mvp`: drop iOS from Non-Goals (if D5 is accepted).
- `commercial-mvp`: task 7.3 and the `apk-distribution` delta should note that organization Play accounts are exempt from the 12-tester / 14-day rule.
- `commercial-mvp`: in billing-plans, change the job-period billing unit, defer annual plans, change cancellation to a 60-day read-only grace period, and add the Single Move Pass as post-launch.
- `platform-foundation` D1 and D5: domain becomes getmoverse.com (or whatever D3 settles), not moverse.app.
- A new change, `expo-sdk-upgrade`, covering the SDK upgrade, the New Architecture move, retesting BLE, and the iOS BLE fixes.
