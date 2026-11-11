# Moverse launch checklist: business operations (non-engineering)

Research date: 2026-11-11. Domain status was checked with RDAP and whois. Other facts come from web searches; figures marked "verify" come only from third-party sources.

## Launch checklist (do these in order)

| # | Step | Cost | Lead time |
|---|---|---|---|
| 1 | **Legal entity** | EU: about €100–€1,000 depending on country (verify locally). US: Stripe Atlas Delaware LLC $500 | 1–4 wks (EU). About 1–2 wks (Atlas) |
| 2 | **Business bank account** | Wise Business (small one-time fee), Mercury free for US LLCs | 1–5 days after entity |
| 3 | **D-U-N-S number** | Free | Apple: up to 5 business days, plus about 2 days to sync. Google: "up to 30 days" |
| 4 | **Domain and email** | Domain about $10–$20/yr. Email $1–$7 per user per month | Same day |
| 5 | **Trademark screen and filing** | EUIPO €850 for 1 class. USPTO about $350 per class (verify) | Screening 1 day. Registration 4–12 months |
| 6 | **Legal documents** | Generator about $14–$20/mo, or a lawyer about €1.5–5k | 1–3 wks |
| 7 | **Store enrollment as an organization** | Apple $99/yr, Google $25 one-time | 1–2 wks after D-U-N-S |
| 8 | **Insurance and bookkeeping** | See section 7 | 1–2 wks |

## 1. Legal entity
- **Why first:** Apple and Google organization accounts need a legal entity with a D-U-N-S number, and the seller name shown in the stores is the entity's name. Enrolling as a personal account would publish the founder's name and address and bind them to the store contracts personally. The entity also gives limited liability and is needed for Stripe B2B invoicing and VAT.
- **EU path:** form a local limited company (UG/GmbH, SARL, Ltd and so on), or an Estonian OÜ through e-Residency (about €100–€150 for the e-Residency card plus about €265 state fee; verify). Register for VAT/OSS for B2C digital sales. B2B sales within the EU use reverse charge.
- **US path:** a Delaware LLC through Stripe Atlas for $500. That covers the filing, the first year of registered agent service and the EIN. Delaware also charges a $400/yr LLC tax due June 1. Atlas does not file taxes. Non-residents need an accountant for Form 5472 plus the pro-forma 1120, roughly $500–$1,000/yr (verify).

## 2. D-U-N-S number
- It is free. First check Apple's D-U-N-S lookup, which may find an existing number instantly. Never pay a third party to "expedite" one.
- Google: you cannot create an organization account without a D-U-N-S number, and Google makes no exceptions. Google warns it can take **up to 30 days**, so request it the day the entity exists.

## 3. Domain (checked 2026-11-11)
- **moverse.com:** taken since 2005, renews 2027-07.
- **moverse.app:** taken since 2025-07.
- **moverse.io:** registered 2025-11, but its nameservers are `dns-expired.com`, so it is lapsed or in auto-renew grace. It may drop soon and is worth watching or backordering.
- **getmoverse.com:** **available**.
- **Recommendation:** register getmoverse.com now (also consider moverse.co and moverse.eu). Use **Cloudflare Registrar**: it sells at cost with no markup and fits our existing Cloudflare/R2 setup. Porkbun is the runner-up and Namecheap is fine. If we ever get a .app domain, remember it is HSTS-preloaded, so it works over HTTPS only.

## 4. Trademark
- My web screen found no exact "MOVERSE" mark in USPTO-indexed sources. I did not check EUIPO directly, so the next step is to search TMview and USPTO for classes 9, 39 and 42 ourselves.
- **Risk:** at least three other companies trade as Moverse:
  - moverse.ai, a 3D-animation AI startup in Greece (an EU company, so a likely EU filer)
  - Moverse Ltd, a fitness app on the iOS App Store
  - a Korean motion-sensing startup
- Any of these could block an EU filing in class 9/42, and an App Store name collision is possible. A one-hour clearance from a trademark lawyer (about €300–€500) is worth it before we put money into branding.

## 5. Email and workspace
- **Google Workspace Business Starter** (about $7 per user per month) is my pick: the shared Drive and Google sign-in for Play Console make it easiest. **Zoho Mail Lite** ($1 per user per month) is the cheapest. **Fastmail** ($3–$5) is the most private.
- Set up aliases or groups rather than extra seats: support@, privacy@ (also the GDPR contact), billing@, legal@, and dev@ for store and console accounts.
- Configure SPF, DKIM and DMARC before Resend starts sending.

## 6. Legal documents
- **Needed:**
  - Privacy Policy
  - Terms of Service (B2B subscriptions)
  - **DPA**: we are the processor and the moving companies are the controllers. The photos show third parties' homes and belongings and can contain personal data.
  - Cookie Policy and consent banner (needed only if the web uses non-essential cookies)
  - Public **subprocessor list**: Supabase, Cloudflare R2, Anthropic, Stripe, Sentry, Resend. Sign each vendor's DPA and record the transfer mechanism (SCCs or the Data Privacy Framework).
  - Records of processing (RoPA) and a short DPIA covering the AI image analysis.
- **Generators:** Termly from about $14/mo with a free tier; iubenda from about €5/mo, with entry pricing unclear (verify). Both cover the privacy, terms and cookie documents. Neither produces a solid B2B DPA.
- **Recommendation:** generate the privacy, terms and cookie documents now, then pay a lawyer once for the DPA and terms (about €1.5–5k) before the first paying customer.

## 7. Insurance, bookkeeping and banking
- **Insurance:** tech errors and omissions plus cyber cover, about $500–$1,500/yr for a solo SaaS company (Hiscox, Embroker, or a local broker; verify).
- **Bookkeeping:** EU: a local accountant (about €100–€300/mo) plus Stripe Tax or a merchant of record. US: Pilot or Bench-type services, or an accountant who handles the 5472 filing.
- **Bank:** Mercury for a US LLC. Wise Business for EU, with multi-currency. Keep company money strictly separate from personal accounts.

## 8. Master accounts register
**Rule:** the company owns every account, signed in with role@ addresses, never a personal Gmail. Each account gets 2FA with a passkey or TOTP (not SMS), and recovery codes go in a shared vault in the password manager. A second trusted person should get emergency access, and all of this should be reviewed every quarter.

| Account | Owner login | Notes |
|---|---|---|
| Password manager (1Password or Bitwarden Teams) | founder | Set up first. Emergency kit kept offline |
| Domain registrar and DNS (Cloudflare) | admin@ | Registrar lock on, auto-renew on |
| Email workspace | admin@ | Second super-admin as break-glass |
| Bank (Mercury or Wise) | founder | Hardware key |
| Apple Developer (organization) | dev@ | Account Holder role, a team admin as backup |
| Google Play Console (organization) | dev@ | Verified identity, D-U-N-S |
| Stripe | billing@ | Team member roles, payout bank account verified |
| Supabase | dev@ | Organization with 2FA enforced |
| Cloudflare (R2) | admin@ | Scoped API tokens only |
| Anthropic API | dev@ | Spend limits, keys rotated |
| Sentry | dev@ | Data scrubbing on |
| Resend | dev@ | Domain verified |
| GitHub organization | founder | Org-level 2FA required, deploy keys |
| Expo/EAS | dev@ | Organization account owns the signing credentials |

## Sources
- [Apple D-U-N-S](https://developer.apple.com/support/d-u-n-s/)
- [Google Play required info](https://support.google.com/googleplay/android-developer/answer/13628312)
- [Tapcart D-U-N-S timing](https://help.tapcart.com/en/articles/11120069-d-u-n-s-number)
- [Stripe Delaware LLC costs](https://stripe.com/resources/more/how-much-does-it-cost-to-form-an-llc-in-delaware-fees-and-other-costs)
- [Atlas vs alternatives 2026](https://www.globalsolo.global/blog/stripe-atlas-vs-firstbase-vs-doola-pricing-comparison-2026)
- [BusinessAnywhere vs Atlas](https://businessanywhere.io/businessanywhere-vs-stripe-atlas/)
- [Business email pricing 2026](https://dupple.com/learn/best-business-email-hosting)
- [TechRepublic email providers](https://www.techrepublic.com/article/best-business-email-providers/)
- [Termly vs iubenda (ToolRadar)](https://toolradar.com/compare/iubenda-vs-termly)
- [Consently comparison](https://consently.net/blog/iubenda-vs-termly)
- [Moverse (Greece), EU-Startups](https://www.eu-startups.com/?p=257172)
- [Moverse iOS app](https://apps.apple.com/vn/app/moverse/id6445987297)
- [Moverse (Korea), CB Insights](https://www.cbinsights.com/company/moverse)
- Domain checks: `curl https://rdap.org/domain/<name>` and `whois`, run 2026-11-11
