# Moverse payments plan (Payments Engineer, Nov 2026)

Research only; no repo files edited.

## 1. Provider choice

| | Stripe Billing + Stripe Tax | MoR: Paddle / Lemon Squeezy / Polar |
|---|---|---|
| Fees | Cards 2.9% + 30c (US). EU-based accounts: roughly 1.5% + EUR 0.25 for EEA cards, +1.5% for international cards. Billing +0.7%, Tax +0.5% (no-code). About 4.1% all-in for domestic cards. | About 5% + 50c for all three (Polar raised its rate in May 2026 to match) |
| Tax | Stripe calculates and collects tax but generally does not file it. You register for EU OSS and in US states once you cross nexus thresholds. | The MoR is the legal seller and handles VAT, OSS and US sales tax |
| Payouts | Daily rolling, 2–7 days | Paddle pays monthly, with a minimum balance |
| Founder countries | About 46 supported | Broader coverage |

**Stripe Managed Payments** is Stripe's own MoR, built by the Lemon Squeezy team. It costs +3.5% on top of standard fees, about 6.4% or more in total. It covers digital products only, its country list is unclear, and it can be added later without re-plumbing.

**Recommendation: Stripe Billing + Tax.**
- The business is mostly B2B, and EU B2B sales with a valid VAT ID are reverse-charged, so there is little VAT to remit.
- US sales tax is only owed after crossing a state's economic nexus threshold (often $100k). Stripe Tax monitors the thresholds.
- The B2C funnel is small and low-value, so paying the MoR premium on all volume costs more than the tax work it saves. If B2C OSS filing becomes a burden, add a filing partner.
- **Switch to Paddle** if the founder's country is not supported by Stripe, or if they want zero tax admin from day 1. The founder's country needs confirming.

## 2. App store rules

### Apple

| Guideline | What it allows | Applies to Moverse |
|---|---|---|
| 3.1.3(c) Enterprise | Access to content and subscriptions sold directly to organisations for their staff. "Consumer, single user, or family sales must use in-app purchase." | Covers company orgs |
| 3.1.3(b) Multiplatform | Access to things bought elsewhere, "provided those items are also available as in-app purchases" | Strictly read, the consumer single-move pass falls under this condition |
| 3.1.3(a) Reader | Only magazines, books, audio, music and video | Does not apply |
| 3.1.3(f) Free stand-alone companion | Only VoIP, cloud storage, email and web hosting | Does not apply |
| 3.1.1 | US storefront apps may include buttons, links and calls to action to other purchase methods. Other storefronts may not without entitlements. | Link-outs allowed in the US only |

Court status:
- Apple has collected no commission on US link-outs since April 2025.
- The Ninth Circuit's Dec 2025 opinion upheld the contempt finding but left the door open to some commission.
- SCOTUS granted cert on 30 Jun 2026 (No. 25-1311), limited to the contempt standard.
- Apple has proposed 5–15% link-out commissions in district court.
- Expect a US commission to arrive eventually.

### Google
- US: the external content links and alternative billing programs exist under the Epic injunction and settlement.
- Enrolled developers must report transactions and pay fees from 1 Oct 2026. For external links, the deadline is extended to 1 Feb 2027.
- Reported link fees are 10% on auto-renewing subscriptions and 20% on other digital content. These are not confirmed on Google's own pages.
- The EEA has separate alternative billing and user-choice billing programs.

### Safe MVP posture
- The apps show no prices, no buy buttons and no checkout links, and they do not enrol in any store program.
- At a limit, show neutral text such as "Your plan doesn't include more active jobs. Ask your account owner." Do not add a link.
- Personal users sign up free in the app and buy the pass on the web only.
- Residual risk: the pass under a strict reading of 3.1.3(b), which only matters once there is an iOS build.
- Revisit US-only link-outs after the SCOTUS decision.

## 3. Per-active-job billing in Stripe

**Licensed quantity with proration is a poor fit.**
- Moves last days, so a 4-day job bills a few cents.
- Proration credits on archive invite activate-then-archive gaming.
- Every change creates proration line items.

**Recommended structure:**
- A flat **base price** (licensed, quantity 1), so the first invoice is not $0.
- A **metered price on a Stripe Meter** (aggregation `count`), where the unit is an **active job-period**: a job counts once per billing period if it was active at any point in that period.
- On job activate, and at each period start for jobs still active, insert into `billable_job_periods(job_id, period_start)` (unique). Emit the meter event only when the insert succeeds, with `identifier = job_id:period`.
- A nightly job reconciles the database against Stripe's meter event summaries.
- Archiving stops the next period's charge, which satisfies the "billing follows active jobs" scenario.

**Free tier, trials and other plan features:**
- **Free tier:** no Stripe object at all, just `plan='free'`. Graduated tiers can make the first job per period free.
- **Trials:** `subscription_data.trial_period_days` in Checkout.
- **Annual:** defer. Metered usage on an annual interval bills a year in arrears. Later, sell an annual prepaid job bundle using credit grants.
- **Coupons:** `allow_promotion_codes: true` in Checkout.
- **Dunning:** Smart Retries plus Stripe's failed-payment emails, and the Customer Portal for updating cards. `past_due` gets a 14-day grace period. `unpaid` or `canceled` downgrades to free, with data kept.

**Webhooks to handle:**
- `checkout.session.completed`; set `client_reference_id = org_id` and store `stripe_customer_id`.
- `checkout.session.async_payment_succeeded` and `checkout.session.async_payment_failed`, for SEPA and ACH.
- `customer.subscription.created`, `.updated`, `.deleted`.
- `invoice.paid`, `invoice.payment_failed`, `invoice.payment_action_required`.
- `customer.subscription.trial_will_end`.
- `charge.refunded`.
- `charge.dispute.created`.

**Webhook processing rules:**
- Verify the signature against the raw body (`await req.text()` in a Next.js route handler).
- Deduplicate with `INSERT INTO stripe_events(id) ... ON CONFLICT DO NOTHING`.
- Events can arrive out of order, so re-fetch the subscription from Stripe and write the derived state rather than trusting the payload.
- Send an `Idempotency-Key` on outgoing Stripe API calls.

**Entitlements:**
- Add `subscription_status`, `current_period_end` and `stripe_subscription_id` to `orgs`.
- Add a table `plan_limits(plan, max_active_jobs, max_items_per_job, describe_daily, max_members)`.
- A single API helper checks plan limits OR a valid job pass. The client never enforces limits.
- Stripe's Entitlements API exists but is unnecessary at MVP.

## 4. Single move pass
- Checkout `mode=payment` with a one-time Price and metadata `{org_id, job_id}`.
- The webhook writes `job_entitlements(job_id, kind='pass', expires_at)`, for example 90 days.
- No subscription is involved. Refunds are issued from the Dashboard and `charge.refunded` revokes the pass.
- Tax: this is a B2C sale, so Stripe Tax charges the customer's local VAT. You must register for EU OSS: non-EU sellers from the first euro, EU sellers above the EUR 10k threshold. This is where an MoR would save work.

## 5. B2B invoicing
- **Checkout settings:** `tax_id_collection.enabled`, `billing_address_collection: 'required'`, `customer_update: {name: 'auto', address: 'auto'}`.
- **Reverse charge:** Stripe Tax applies it automatically for an EU business customer with a VAT ID in another member state, and prints the reverse-charge note. VAT IDs are verified against VIES (`tax_id.verification`).
- **Invoices:**
  - PDFs and the hosted invoice page are automatic.
  - Configure the legal entity name, address, VAT number and footer in invoice settings.
  - Use sequential numbering at account level.
- **Payment methods:**
  - Cards and Link.
  - SEPA Direct Debit: settlement is delayed by days, so handle the async events.
  - ACH Direct Debit: 0.8%, capped at $5.
  - `collection_method='send_invoice'` with bank transfer for larger customers.

## 6. Test → live go-live checklist

**What Stripe needs from the business:**
- A legal entity or sole trader, a tax ID or VAT number, and ID verification of the representative.
- A business bank account in the entity's country.
- A statement descriptor and support contact.
- A public website with a product description, **pricing page**, **Terms of Service**, **privacy policy**, **refund and cancellation policy**, and contact details.

**Engineering steps:**
- Reference Prices by `lookup_key`, never hard-coded IDs, so the code is mode-agnostic.
- Recreate in live mode: products, prices and meters, the Customer Portal configuration, Smart Retries and email settings, invoice settings, Tax origin address and registrations, and the webhook endpoint and its secret.
- Put live keys in the Vercel production environment only. Staging and previews keep test keys.
- Before launch, use the Stripe CLI to replay webhooks and test decline, 3DS and SEPA-failure cards.
- After launch, make a real-card purchase, refund it, and check the DB state changes.
- Review Radar rules and Checkout branding.

## Spec impact
billing-plans says "metered monthly on the count of active jobs". The job-period unit above makes that precise, so consider rewording the "Billing follows active jobs" scenario to match.

## Caveats
- Most fee figures come from secondary sources.
- The Stripe Billing rate is reported as anywhere from 0.5% to 0.8%; check stripe.com/billing/pricing.
- The Google 10%/20% link fees are not confirmed on Google's own pages.

## Sources
- Apple App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- SCOTUS cert grant: https://www.macrumors.com/2026/06/30/apple-epic-games-supreme-court/ ; https://ipwatchdog.com/2026/06/30/high-court-grants-cert-in-apples-challenge-to-ninth-circuit-contempt-ruling-in-app-store-dispute/
- Apple proposed 5–15% commissions: https://www.mlex.com/mlex/articles/2515086
- Ninth Circuit stay reversal: https://macrumors.com/2026/04/29/epic-games-wins-reversal-app-store-fee-battle/
- Dec 2025 Ninth Circuit ruling: https://www.iclarified.com/99335/appeals-court-reverses-zero-commission-ban-on-apple-says-27-fee-is-too-high
- Google Play US program notice: https://support.google.com/googleplay/android-developer/answer/15582165
- Google fee changes: https://www.androidheadlines.com/2026/06/google-play-store-external-billing-fee-changes.html
- MoR fee comparisons: https://bigideasdb.com/saas-payment-processor-choice-2026 ; https://alexcloudstar.com/blog/merchant-of-record-indie-saas-2026/ ; https://fungies.io/polar-sh-review-2026
- Stripe Managed Payments: https://dodopayments.com/blogs/stripe-managed-payments-fees-explained ; https://stripe.com/en-ch/managed-payments
- Stripe Tax pricing: https://dodopayments.com/blogs/stripe-tax-explained
- Stripe Billing pricing: https://www.withorb.com/blog/stripe-billing-pricing
- Paddle supported countries: https://developer.paddle.com/concepts/sell/supported-countries-locales
- Paddle VAT handling: https://paddle.com/support/how-does-paddle-handle-vat-on-my-behalf/
