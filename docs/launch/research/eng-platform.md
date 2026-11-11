# Moverse hosting recommendation (Platform/Infra)

Recommendation: keep **Supabase Cloud Pro (EU) + R2 + Vercel**. The new DigitalOcean wording shouldn't trigger a migration. If Vercel ever costs or limits too much, move only the API and `web/` to DO App Platform; Postgres and Auth should stay managed by Supabase. Prices were checked on 2026-11-11 (sources at the end).

## 1. Three production topologies

| | (a) Status quo: Vercel + Supabase Cloud + R2 | (b) DO App Platform + DO Managed PG + separate auth | (c) Self-hosted Supabase on a Droplet or Hetzner VM, plus R2 |
|---|---|---|---|
| **Beta** (5 orgs, 50 users) | Vercel Pro $20, Supabase Pro $25 (includes the Micro compute), R2 about $0 → **≈ $45–50/mo** | API $12, web $12, auth container $5–10, PG $15.15 (1 node, no high availability), Spaces $5 → **≈ $50–55/mo** | DO 8 GB $48 + 30% daily backups $14 → **≈ $62/mo** (Hetzner 8 GB is roughly €9–36 after its 2026 price rise; exact figure not confirmed) |
| **Growth** (100 orgs, 1,500 users, 2 TB photos) | Vercel $20–40; Supabase Pro + Medium compute ($25 + $50 net); PITR +$100 for 7 days (optional); R2 2 TB ≈ $30 + operations about $5 → **≈ $130–250/mo** | Apps ≈ $50; HA PG with a matching standby ≈ $120+; Spaces ≈ $41 + transfer → **≈ $210–250/mo** | 16 GB VM ≈ $96 + backups + WAL archive to R2 → **≈ $130/mo, plus your time** |
| **Ops burden (solo founder)** | Lowest. Upgrades, backups and auth are managed for you | Medium. You run auth yourself and do your own RLS/JWT plumbing | Highest. About 12 containers to patch, Postgres tuning, upgrades, you are the on-call DBA |
| **Backups / PITR** | 7 days of daily backups; PITR $100/mo per 7 days | Daily backups plus WAL; **7-day PITR included** | Do-it-yourself (wal-g/pgBackRest → R2). Untested backups are a real risk |
| **EU residency** | Supabase EU region; R2 EU jurisdiction bucket; Vercel functions pinned to an EU region | FRA1/AMS3 | Hetzner DE/FI or DO FRA1. The strongest residency story |
| **Lock-in** | Moderate. Plain Postgres + GoTrue (open source); R2 uses the S3 API | Low | Lowest |
| **Migration effort** | None | **High.** The code assumes supabase-js, `auth.uid()` in RLS and GoTrue JWTs. Better Auth, Lucia or Clerk means a new identity layer, rewritten RLS helpers and changes to the mobile sign-in. Self-hosting GoTrue against DO PG needs the `auth` schema and roles set up by hand | Low for the code (same APIs); high ongoing ops cost |

Things to know:

- **DO Standard Edition PG** cannot add standby nodes on new clusters after 30 Nov 2026, so high availability means Advanced Edition. No published Advanced Edition price was found; confirm it in the DO console.
- **Spaces vs R2.** Spaces costs $5 for 250 GiB + 1 TiB of transfer, then $0.02/GiB stored and $0.01/GiB transferred. R2 costs $0.015/GB with no egress fees; Infrequent Access is $0.01/GB. For a product whose photo traffic is mostly downloads, R2 wins. Keep it either way.
- **Vercel Pro**: $20 per seat with $20 of included usage; 1 TB Fast Data Transfer, then $0.15/GB; WAF billed at $0.50 per 1M allowed requests. Hobby is non-commercial, so it can't be used for production.

## 2. Recommendation

Stay on **(a)** through beta and early growth:

- Supabase Pro at $25 + compute is cheaper than DO's HA Postgres and includes auth.
- The database and auth are the hardest pieces for one person to run safely.
- The RLS and GoTrue design in `platform-foundation` relies on Supabase exactly. Moving to (b) means a rewrite with no product payoff.

**Escape hatch:** if Vercel bites (function CPU, WAF per-request billing, $0.15/GB transfer overage), move `api/` and `web/` to DO App Platform ($12–24/mo, $0.02/GiB transfer).

- `api/*` uses Web-standard Request/Response, so wrapping it in Hono on Node is a small port.
- Rebuild D11's Vercel WAF rate limits as Cloudflare WAF rules.

Revisit (c) on Hetzner only if a customer requires an EU-sovereign host, or if Supabase compute passes about $300/mo.

## 3. Domains and DNS (Cloudflare)

| Host | Target | Purpose |
|---|---|---|
| `moverse.app` (apex) + `www` | web (Vercel/DO) | Marketing, pricing, billing, dashboard |
| `moverse.app/j/<token>` | web | Invite landing; falls back to store links |
| `moverse.app/.well-known/assetlinks.json`, `apple-app-site-association` | web (static, `application/json`, no redirect) | App Links and Universal Links for `/j/*` |
| `app.` | web dashboard (optional split) | |
| `api.` | API | Mobile `API_URL` |
| `r.` | web report route | Client report links; separate host so report cookies and rate limits are isolated |
| `auth.` | CNAME to the Supabase custom domain (Pro add-on) | Lets you move off Supabase later without changing the URL baked into apps |
| `photos.` | R2 custom domain (optional) | |
| `staging.`, `api.staging.`, `sb.staging.` | Vercel Preview / Cloudflare Tunnel → Proxmox | Put **Cloudflare Access** in front of staging |

Keep `/j/*` and `.well-known` on the apex, where the D10 deep links point. Set Cloudflare SSL to Full (strict) and add CAA records.

## 4. Transactional email

| | Price | Notes |
|---|---|---|
| **Resend** | Free: 3k/mo (100/day); Pro: $20 for 50k | Best developer experience, React Email. The 100/day free cap is too tight once companies use it |
| **Postmark** | $15 for 10k (Basic) | Best inbox placement for OTP and magic-link mail. **Recommended for auth email** |
| **SES** | About $0.10 per 1k | Cheapest, but you manage reputation, bounces and sandbox exit yourself |

Recommendation: Postmark as Supabase's custom SMTP, sending from `mail.moverse.app` (marketing mail stays separate).

DNS records:

- **SPF**: on the return-path subdomain, as the provider instructs (for Postmark, a CNAME to `pm.mtasv.net`; the apex SPF lists only the senders you actually use, ending in `~all`).
- **DKIM**: the provider's CNAME or TXT records.
- **DMARC**: start at `p=none; rua=…`, then move to `quarantine` and finally `reject` within about 4 weeks.

## 5. Operations

- **Observability**
  - Sentry free tier (mobile, web, API), with release tracking from EAS and CI.
  - Uptime: Better Stack or UptimeRobot hitting `/health` (checks the DB with `select 1`) and a synthetic `/me`.
  - Logs: Vercel and Supabase log drains into Better Stack or Axiom.
- **Secrets**
  - Production and staging values live only in the Vercel/DO environment, Supabase and EAS secrets; locally, `.env` is gitignored.
  - Add gitleaks to CI as a pre-merge check.
  - Never let the service-role key reach the client.
- **CI/CD (GitHub Actions)**
  - On pull request: typecheck, tests, `supabase db lint`, and migrations against an ephemeral `supabase start`.
  - On merge: `supabase db push` to staging, then deploy.
  - Production: a manually approved job (GitHub Environments) with migrations first, then the app. EAS builds come from tags.
- **Backups and restore drill**
  - Supabase daily backups, plus a weekly `pg_dump` to an R2 bucket with object lock.
  - R2 bucket versioning and lifecycle rules.
  - Restore drill each quarter: restore the dump into the staging Supabase, run smoke tests, and record the time to restore. Add PITR once paying customers' data justifies $100/mo.
- **Incidents (one person)**
  - Uptime and Sentry alerts go to phone push (Better Stack on-call is free for one user).
  - A status page.
  - A one-page runbook: rollback the deploy, pause `/describe`, rotate keys, restore the DB.
  - Severity levels, with a promise to answer B2B customers within 24 hours.

## 6. Security launch checklist

- [ ] **Rotate `APP_SECRET` now.** It is in git history and in public APKs. Then remove it after the move to JWTs (platform-foundation 1.1).
- [ ] Scan git history with gitleaks or trufflehog. Rotate anything else found: Airtable, Anthropic and R2 keys.
- [ ] Turn on RLS for every table. Run RLS tests for cross-org access, crew escalation and anon users.
- [ ] Service-role key only on the server. R2 presigned URLs expire in 15 minutes or less. Bucket is private.
- [ ] Supabase: rotate the JWT secret and keys, set up custom SMTP, set GoTrue rate limits and CAPTCHA on OTP, require MFA on the dashboard.
- [ ] Every vendor account (GitHub, Vercel/DO, Supabase, Cloudflare, Apple/Google, Stripe, Postmark) uses 2FA and hardware keys. Branch protection on `main`.
- [ ] Cloudflare WAF rate limits on `/invites/consume`, `/account/*`, `/describe` and `r.*`.
- [ ] Verify Stripe webhook signatures. Make invite tokens high-entropy, single-use and expiring.
- [ ] CSP and security headers on `web/`. Validate `.well-known` files with Google and Apple tools.
- [ ] GDPR: DPAs with Supabase, Cloudflare, Vercel, Postmark and Anthropic. Publish a privacy policy, a sub-processor list and a working account-deletion flow (D14).
- [ ] Complete one restore drill and keep the incident runbook ready before the first paying customer.

## Sources

- [Supabase pricing](https://supabase.com/pricing)
- [Vercel pricing](https://vercel.com/pricing)
- [Cloudflare R2 pricing](https://developers.cloudflare.com/r2/pricing/)
- [DO Managed Databases pricing](https://www.digitalocean.com/pricing/managed-databases)
- [DO PostgreSQL pricing details (standby / Standard Edition change)](https://docs.digitalocean.com/products/databases/postgresql/details/pricing/)
- [DO PostgreSQL features (7-day PITR)](https://docs.digitalocean.com/products/databases/postgresql/details/features/)
- [DO App Platform pricing](https://www.digitalocean.com/pricing/app-platform)
- [DO Spaces pricing](https://www.digitalocean.com/pricing/spaces-object-storage)
- [DO Droplet pricing](https://www.digitalocean.com/pricing/droplets)
- [Hetzner Cloud](https://www.hetzner.com/cloud)
- [Hetzner 2026 price changes (third-party)](https://www.bitdoze.com/hetzner-cloud-cost-optimized-plans/)
- [Hetzner price adjustment notice](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/)
- [Resend pricing](https://resend.com/pricing)
- [Postmark pricing](https://postmarkapp.com/pricing)
