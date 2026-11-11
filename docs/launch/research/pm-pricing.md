# Moverse: pricing, packaging and go-to-market (PM report)

## What competitors charge
- **Moving-company software (CRM and operations):**
  - SmartMoving costs about $299–399/mo flat ([Capterra](https://www.capterra.com/p/180048/SmartMoving-Software/pricing/), [GetApp](https://www.getapp.com/industries-software/a/smartmoving-software/pricing/)).
  - Supermove is reported at about $176 per crew per month, with a minimum of 2 crews ([Tekpon](https://tekpon.com/software/supermove/reviews)).
  - MoveHQ starts at $99 per user per month ([Capterra](https://www.capterra.com/p/179456/MoveHQ/)) and MoveitPro at about $150/mo ([Capterra](https://www.capterra.com/p/154185/MoveitPro/)).
  - Yembo only quotes on request ([TrustRadius](https://www.trustradius.com/products/yembo/pricing)).
- **Charging per job is normal in this space:**
  - Voxme charges $300/yr plus $3 per job for digital inventory ([G2](https://www.g2.com/products/voxme-digital-inventory-portal/pricing), [Voxme blog](https://www.voxme.com/blog/moving-inventory-cost), [GetApp](https://www.getapp.com/software/2062030/voxme)).
  - Encircle starts at $285/mo for about 200 jobs a year, which is roughly $17 per job, and sells AI item descriptions as an add-on ([Encircle](https://www.getencircle.com/pricing), [Capterra](https://www.capterra.com/p/160202/Encircle/pricing/)).
- **General inventory tools:** Sortly is free, then $49, $149 and $299/mo, with about 50% off for annual billing ([CostBench](https://www.costbench.com/software/inventory-management/sortly/), [Capterra](https://www.capterra.com/p/169199/Sortly-Pro/pricing/)).
- **Consumer box-label apps** cost $4–9/mo or $40–45/yr ([Argosy QR](https://apps.apple.com/us/app/id1600403684?l=en-us), [Everspruce](https://apps.apple.com/app/id1393940808)).
- **Takeaways:**
  - Moving companies already pay $100–400/mo for their main software, so Moverse should be a cheap add-on next to it, not a replacement.
  - Customers already understand paying per job.

## 1. Plans
**Recommended model:** flat tiers that each include a number of active-job slots, plus a per-job charge above that.
- **Why not per seat:** crews are temporary and join by QR code. Charging per seat would penalise inviting them, and inviting is the core flow.
- **Why not pure per-active-job:** the monthly bill is hard to predict. Flat tiers fix that, and a slot frees up when a job is archived, which keeps the design's "archive = stop paying" idea (D6).

| | **Free (personal)** | **Starter** | **Pro** | **Fleet** |
|---|---|---|---|---|
| Monthly | $0 | $49 / €49 | $149 / €149 | from $399 / €399 |
| Annual (per month) | – | $39 / €39 | $119 / €119 | custom |
| Active jobs at once | 1 | 5 | 20 | 60+ |
| Extra active job (per month) | – | $8 | $6 | $4 |
| Admins / crew | 1 + 2 helpers | 2 / unlimited | 10 / unlimited | unlimited |
| AI descriptions per month | 50 (5/day) | 3,000 | 12,000 | 40,000 |
| Photo storage | 2 GB | 25 GB | 100 GB | 500 GB+ |
| Client report | Moverse-branded | Company logo | Logo and colours, PDF | White-label, custom domain, CRM integration |

- B2B EUR prices exclude VAT (reverse charge for EU businesses). Use Stripe Tax.
- **One-off Single Move Pass for personal movers: $19 / €19, including VAT.**
  - Covers 1 job for 120 days: 1,000 items, 1,000 AI descriptions, 5 helpers, PDF/ZIP export, and 12 months of read-only access afterwards.
  - **Recommendation: build it, but at low priority.** People move about once every 5–7 years, so a subscription would churn straight away; a pass fits how they actually buy.
  - It costs about $3 to serve, so the margin is about 80% after Stripe fees.
  - Sell it on the web with Stripe, not Play Billing (D6). Show it when a free user hits a limit, so it doesn't distract from the company plans.

## 2. Trial, discounts, overage, cancellation
- **Trial:** 14 days of Pro with no card required. If the company doesn't pay, it drops to Free and its jobs become read-only.
- **Beta companies:** 3 months free, then 30% off for 12 months. In return they give weekly feedback and a case study, and their crews act as the 12+ Play Store closed testers.
- **Annual billing:** about 20% off ("2 months free"). Sortly's 50% isn't needed at our price level.
- **Active jobs over the allowance:** charged per job at the next invoice, with a warning at 80% of the allowance.
- **When AI descriptions run out:**
  - Capture keeps working with photos only; packing is never blocked.
  - The company can buy a pack (1,000 for $10, cost to us about $3), or the queued descriptions run when the next month starts.
- **Cancellation (builds on design D11):**
  - Access continues to the end of the paid period.
  - Then 60 days in read-only mode: reports stay live and every job can be exported (PDF report plus a ZIP of photos).
  - After that, reports are revoked and photos deleted.
  - I'd use 60 days rather than D11's example of 30 because damage claims arrive weeks or months after a move; US interstate claims can be filed up to 9 months after delivery under the Carmack rules. Legal should confirm that figure.
- **Retention while subscribed:** archived jobs keep their photos for 24 months at no extra charge. Storage costs about $0.0015 per job per month, so this costs us nothing and gives us a selling point for claims disputes.
- **Free and Pass users:** data is kept for 12 months after the last activity or the end of the pass, then deleted after an email warning and an export window.

## 3. Unit economics
- **AI cost per item (Claude Haiku):**
  - About 1.5k input tokens (image plus prompt) at $1/M is $0.0015.
  - About 150 output tokens at roughly $5/M is $0.00075.
  - Allowing for retries, that's about **$0.003 per item**.
- **Typical company job** (400 described items, 500 photos at 200 KB):
  - AI: $1.20.
  - Storage: 0.1 GB at $0.015/GB-mo, so about $0.0015/mo, or about $0.02 a year.
  - R2 operation fees: negligible.
  - **Total: about $1.25 per job** ($3 for a large 1,000-item job).
- **Worst case per plan** (every included AI description used, plus Stripe at 2.9% + $0.30):

| Plan | Price | Maximum AI cost | Stripe | Gross margin |
|---|---|---|---|---|
| Starter | $49 | $9 | $1.72 | about 78% (about 90% at typical usage) |
| Pro | $149 | $36 | $4.62 | about 73% (85–88% typical) |
| Extra job | $6–8 | about $1.30 | – | about 80% |
| Move Pass | $19 | $3 | $0.85 | about 80% |
| Free user | $0 | $0.15/mo maximum | – | funnel cost |

- **Fixed costs** are about $45–100/mo (Supabase Pro, Vercel Pro, Sentry). Three Starter customers cover them.
- The AI description cap is what keeps costs bounded, so the limits have to be enforced on the server (per-company usage table).

## 4. Go-to-market
- **Beta (8–10 weeks), with 2–3 companies:**
  - Target local movers with 5–30 crew who offer packing services or white-glove/storage work.
  - Include at least one EU company to test EUR pricing and VAT.
  - Find them through local outreach, mover Facebook groups and storage partners.
  - Questions to answer:
    - Does per-active-job pricing make sense to them?
    - Do their clients actually open the report?
    - How many items get AI descriptions in a real job?
    - How many jobs are active at once?
- **Launch channels:**
  1. **The client report.** Every report has an "Inventory by Moverse" footer, so each one advertises to both consumers and other movers.
  2. **Trade associations and events:** AMSA ProMover (US), BAR (UK), FIDI (international).
  3. **SEO** around "moving inventory list", "how to label moving boxes" and "moving claims photos".
  4. **Short videos** of QR scan → box contents (TikTok, YouTube, Reddit r/moving) for personal movers.
  5. **A NIIMBOT affiliate link or bundle.**
  6. **Later:** integration listings with SmartMoving and Supermove (be the inventory add-on next to them, not a competitor).
  7. **App store optimisation** on Google Play.
- **KPIs to watch:**
  - **Company activation:** first job, crew invited and 50+ items within 7 days. Target 60% or more.
  - **Trial-to-paid conversion:** target 15–25% (no card required).
  - **Report usage:** share rate per job and client open rate.
  - **Active jobs per company** and overage revenue.
  - **Customer churn:** under 3% a month.
  - **Net revenue retention:** over 100%.
  - **AI cost per job**, and the share of AI descriptions users edit (a proxy for quality).
  - **Free-to-Pass conversion:** target 3–5% of free users who hit a limit.
  - **Leads from report footers.**

## Sources
- SmartMoving: [Capterra](https://www.capterra.com/p/180048/SmartMoving-Software/pricing/), [GetApp](https://www.getapp.com/industries-software/a/smartmoving-software/pricing/)
- Supermove: [Tekpon](https://tekpon.com/software/supermove/reviews)
- MoveHQ: [Capterra](https://www.capterra.com/p/179456/MoveHQ/); MoveitPro: [Capterra](https://www.capterra.com/p/154185/MoveitPro/)
- Yembo: [TrustRadius](https://www.trustradius.com/products/yembo/pricing)
- Voxme: [G2](https://www.g2.com/products/voxme-digital-inventory-portal/pricing), [Voxme blog](https://www.voxme.com/blog/moving-inventory-cost), [GetApp](https://www.getapp.com/software/2062030/voxme)
- Encircle: [Encircle pricing](https://www.getencircle.com/pricing), [Capterra](https://www.capterra.com/p/160202/Encircle/pricing/)
- Sortly: [CostBench](https://www.costbench.com/software/inventory-management/sortly/), [Capterra](https://www.capterra.com/p/169199/Sortly-Pro/pricing/)
- Consumer apps: [Argosy QR](https://apps.apple.com/us/app/id1600403684?l=en-us), [Everspruce](https://apps.apple.com/app/id1393940808)
