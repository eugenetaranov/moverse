# Moving checklist

## Why

People search for "moving checklist" weeks before they start packing. That is earlier than Moverse can reach them today, and it is one of the most searched moving terms. A free checklist, published on the web, used inside the app and branded by moving companies for their clients, does three jobs:
- It brings in search traffic.
- It gives free personal users a reason to open the app before packing starts.
- It gives paying companies a branded "before the move" page alongside the client report.

The checklist always leads back to the box inventory, so it doesn't turn Moverse into a general to-do app. See `docs/launch/launch-plan.md` §6.

## What Changes

- **Checklist templates:** curated, versioned task lists grouped by phase:

  | Phase | When |
  |---|---|
  | 8+ weeks before | well ahead of the move |
  | 4 weeks before | |
  | Moving week | |
  | Moving day | |
  | After the move | |

  Each task has a title, an optional note, a due offset relative to the move date, and an optional **action link** into Moverse (e.g. "Pack the kitchen" → start capture; "Check every box arrived" → the delivered filter). There is one general template at launch, and more are added as content, not code.
- **Public checklist page:** `/moving-checklist` on the marketing site.
  - Search-optimised, rendered on the server, no account needed.
  - Tick-offs are saved in the browser.
  - The user can enter a move date to see due dates.
  - Printable / save-as-PDF layout.
  - Packing tasks show a call-to-action for the app.
  - The page is built so further guide pages can reuse it.
- **Email reminders:** optional sign-up with double opt-in. It sends the checklist plus a few reminders timed to the move date. Every email has a one-click unsubscribe. Consent is recorded.
- **In-app checklist for personal users:**
  - Created from the template when a personal job gets a move date (asked for at first use).
  - Grouped by phase, with progress, the ability to add custom tasks, and due dates.
  - Action links open the right Moverse screen.
  - No purchase prompts or links inside the app (app-store rules, `docs/launch/launch-plan.md` §3).
- **Branded client checklist for companies:**
  - Owners and admins keep one checklist template per org: start from the default, edit or add tasks, and mark which tasks are the **client's** to do.
  - Each job gets a copy, shown on the client report page as a "Before your move" section with the company's name.
  - The client can tick off client tasks through the report link, and the company sees those ticks in the app.
- **Move date on jobs:** a job gains an optional move date. It drives due dates in every checklist.

## Capabilities

### New Capabilities
- `checklist-templates`: curated phased task lists, due offsets and action links. They are the single content source for the web, the app and the company checklists.
- `public-checklist`: the public, search-optimised checklist page with browser-saved progress, a print layout and the app call-to-action.
- `checklist-email-reminders`: double-opt-in email capture, reminder emails timed to the move date, unsubscribe, and consent records.
- `job-checklist`: a per-job checklist in the app, created from a template, with progress, custom tasks, due dates and action links. Personal users get it in the app; companies get it through the client checklist.
- `client-checklist`: org-level checklist templates for companies, plus the branded checklist section on the client report where clients tick off their own tasks.

### Modified Capabilities
None. Job move dates are an addition to the in-flight `job-management` capability (`platform-foundation`), and are specified here under `job-checklist` to avoid editing an unarchived change.

## Impact

- **Depends on:**
  - `platform-foundation`: jobs, roles, the job-context header and RLS helpers.
  - `commercial-mvp`: `marketing-site` (the web app shell), `client-report` (the token route and page), and custom SMTP (Postmark).
- **DB:**
  - `jobs.move_date`
  - `job_checklist_items`
  - `org_checklist_templates`
  - `checklist_subscribers`, holding email, consent and token data
- **API:**
  - `/jobs/checklist` (read, tick, add, edit, delete)
  - `/org/checklist-template`
  - `/jobs` gains `moveDate`
  - public `POST /checklist/subscribe`, `/checklist/confirm`, `/checklist/unsubscribe`
  - report-token tick endpoint for client tasks
- **Web:**
  - `/moving-checklist` page and print stylesheet
  - email confirm/unsubscribe pages
  - a "Before your move" section on the report page
  - a scheduled reminder sender (Vercel cron)
- **Mobile:** a checklist screen for personal users, a move-date prompt, an action-link router, and a checklist entry point for company admins (template editor and per-job client-task status).
- **Content:** template files in the repo, reviewed like code.
- **Legal:** the email list adds a processing purpose to the privacy policy (marketing consent) and Postmark's broadcast stream as a sub-processor use.
