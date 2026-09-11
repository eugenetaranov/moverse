# marketing-site Delta

## ADDED Requirements

### Requirement: Public landing and pricing pages

The web app SHALL serve a public landing page presenting Moverse for moving companies (pack → track → client report) with a secondary personal-use path, and a pricing page showing the per-active-job company plan and the free personal tier. Pages SHALL be fast static/server-rendered pages using the design-system tokens.

#### Scenario: Company visitor reaches signup

- **WHEN** a moving-company visitor lands on the site
- **THEN** they can reach pricing and start company signup within two clicks

### Requirement: Signup hand-off to app and checkout

Company signup on the web SHALL create the account and org, take payment via Stripe Checkout, and end on a getting-started page (download the Android app, sign in, create the first job, invite crew). Personal visitors SHALL be directed straight to the app download with signup happening in-app.

#### Scenario: Company end-to-end signup

- **WHEN** a company completes web signup and checkout
- **THEN** they land on a getting-started page and can sign into the mobile app with the same credentials, with their org already on the paid plan

### Requirement: Legal pages

The site SHALL serve a privacy policy and terms of service at stable URLs, suitable for the Google Play listing's privacy-policy link and the data-safety form, covering photo storage, AI description processing (photos sent to Anthropic), analytics, and data deletion.

#### Scenario: Play listing references the policy

- **WHEN** Google Play review checks the privacy policy URL
- **THEN** it resolves to the current policy describing photo and personal-data handling and the account-deletion path
