# billing-plans Delta

## ADDED Requirements

### Requirement: Company subscriptions via Stripe on the web

Company orgs SHALL subscribe through the web app using Stripe Checkout, priced per active job (metered monthly on the count of active jobs). Owners SHALL manage the subscription (payment method, cancel, invoices) through the Stripe customer portal. The mobile app SHALL contain no purchase flow and no Play Billing — it links to the web for anything billing-related.

#### Scenario: Company subscribes

- **WHEN** a company owner completes Stripe Checkout from the pricing page
- **THEN** the org's plan becomes `company`, and its members can create jobs beyond the free limits immediately

#### Scenario: Billing follows active jobs

- **WHEN** a company has 6 active jobs at the billing point and archives 2
- **THEN** the subsequent billing reflects 4 active jobs

#### Scenario: Mobile app stays billing-free

- **WHEN** a user looks for payment options in the mobile app
- **THEN** there is no in-app purchase; billing screens link out to the web dashboard

### Requirement: Plan state synchronized by Stripe webhooks

The system SHALL update the org's plan state from Stripe webhook events (checkout completed, subscription updated, payment failed, subscription canceled). On cancellation or terminal payment failure the org SHALL downgrade to the free tier limits without deleting any data.

#### Scenario: Cancellation downgrades gracefully

- **WHEN** a company's subscription is canceled
- **THEN** the org reverts to free-tier limits, existing data and reports stay readable, and creating jobs beyond the free limit is blocked with an upgrade prompt

### Requirement: Free tier limits enforced server-side

The free (personal) tier SHALL be limited server-side: 1 active job, a cap on items per job (e.g. 500), and the `/describe` daily quota. Limit checks SHALL happen in the API; the client SHALL surface friendly messages but SHALL NOT be the enforcement point.

#### Scenario: Second active job requires a plan

- **WHEN** a free-tier user attempts to create a second active job
- **THEN** the API refuses with a limit error and the app explains the paid plan

#### Scenario: Limits cannot be bypassed by a modified client

- **WHEN** a request over a free-tier limit is sent directly to the API
- **THEN** it is rejected server-side regardless of client behavior
