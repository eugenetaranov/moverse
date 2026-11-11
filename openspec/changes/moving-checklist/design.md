# Design

## Context

- **Dependencies:** this change builds on `platform-foundation` and `commercial-mvp`:
  - the org → job model, roles and `withAuth` (`platform-foundation`)
  - the RLS helpers `org_role` / `can_access_job` (`platform-foundation`)
  - the `web/` Next.js app: marketing site and token-based report route (`commercial-mvp`)
  - Postmark custom SMTP (`commercial-mvp`)
  - the offline save queue (`commercial-mvp` `offline-capture`)
- **Rules that constrain the design:**
  - The mobile app may show no purchase UI (`docs/launch/launch-plan.md` §3).
  - Personal users must see no org or job chrome (`job-management`).
  - Crew are locked to packing.
- **Not built yet:** the web app, the report page and offline queue are not built. This change is planned to land after them; see the launch plan, where it follows the marketing site.

## Goals / Non-Goals

**Goals:**
- One content source for every checklist surface.
- The public page ranks and works without JavaScript.
- Clients can do their own tasks without an account, with no wider access than the existing report link.

**Non-Goals:**
- Push notifications and in-app reminders (email only, and only for public subscribers).
- Multiple templates per org, template marketplaces, or localisation (later content work).
- Assigning tasks to specific crew members, or crew access to checklists.
- Sending reminder emails to company clients (companies share the report link themselves).
- Guide pages beyond `/moving-checklist`. The page component is reusable, but extra pages are content work.

## Decisions

### D1. Templates are versioned JSON files in the repo
- **Location:** `content/checklists/<key>.json`, validated against a JSON schema in CI. The schema enforces phases, offsets, unique task keys and the allowed action-link destinations.
- **Used by:**
  - the web page, which imports it at build time (static, fast, search-friendly)
  - the API, which bundles it to create job checklists
  - nothing else: the app never reads templates directly, it reads the job's checklist rows
- **Alternative rejected: templates in a DB table with an admin UI.** That is a CMS we don't need. Content changes are rare and should be reviewed like code.

### D2. Job checklist = copied rows, not references
- **Table:** `job_checklist_items` with:
  - `id`, `job_id`, `task_key` (null for custom tasks), `phase`, `position`, `title`, `note`
  - `due_offset_days` (template tasks) or `due_date` (custom tasks)
  - `action`, `audience` (`client` | `company`; always `company` for personal jobs)
  - `done_at`, `done_by_user_id`, `done_by_client`
  - `template_key`, `template_version`
- **Why copy:** the template is copied when the checklist is created, so edits to a template never rewrite an existing checklist, and custom tasks sit alongside template tasks naturally.
- **Due dates** are computed when read, from `jobs.move_date + due_offset_days`, so changing the move date reschedules everything with no data migration.
- **Alternative rejected: store only ticks against template task keys.** It breaks as soon as a template changes or a company edits a task.

### D3. Org template stored as JSON on the org
- `org_checklist_templates(org_id pk, tasks jsonb, updated_at, updated_by)`. It is created lazily as a copy of `general` the first time an admin opens the editor or a job checklist is created.
- It is validated by the same JSON schema.
- **Why one JSON document:** it is edited as a whole by one admin at a time, and only copied into jobs. It is never queried task by task.

### D4. Client ticks through the report token
- **Endpoint:** `POST /r/<token>/checklist/<itemId>` with `{ done: boolean }`. It is a web route handler using the privileged module that already resolves report tokens.
- **What it checks:**
  - It hashes the token and looks up the job.
  - It refuses the request unless the item belongs to that job and has `audience = 'client'`.
  - It writes only `done_at` and `done_by_client`.
- **Rate limits:** per token and per IP, through the Cloudflare WAF rules the launch plan already calls for on `r.*`.
- **Why it's safe:** the token already gives read access to the whole inventory. Letting it tick client tasks adds a very small write ability, limited to that job's client tasks. Regenerating the token cuts it off.
- **Alternative rejected: a client account or magic link.** It adds friction for a task list, and the report link is already the client's key.

### D5. In-app checklist and offline
- **Who uses it:** personal users get a **Checklist** tab. Owners and admins open a job's checklist from the job switcher or overview, and edit the org template under Settings. Crew get neither.
- **Offline:** ticks, adds and edits go through the existing offline save queue, using client-generated UUIDs. The server upserts on those IDs (the same idempotency pattern as `/save`). The checklist is cached per job, like the inventory.
- **Action links:** a small router maps the destination enum to navigation calls. An unknown destination is ignored, because templates are validated in CI.

### D6. Public page and email
- **Page:** a static Next.js page built from `general.json`, with HowTo/ItemList JSON-LD and a sitemap entry.
- **Tick state:** kept in `localStorage`, behind try/catch, under the key `moverse.checklist.general.v<version>`.
- **Printing:** handled by a print stylesheet; no server-side PDF.
- **App call-to-action:** a smart link. Android App Links and iOS Universal Links on the same domain open the app if it's installed, and fall back to the store.
- **Email list:** stored in our own Postgres (`checklist_subscribers`), not in a marketing tool. It is small, consent records must be kept, and it avoids another sub-processor.
  - Postmark sends transactional confirmations on its transactional stream, and reminders on a separate **broadcast** stream so they don't affect the sign-in emails' deliverability.
  - A daily Vercel cron picks reminders due today. A `sent` record per subscriber and reminder makes the job safe to retry.
- **Alternative rejected: Mailchimp, Resend Audiences or similar.** Faster to set up, but it splits the consent records off and adds a vendor for an expected list of hundreds to thousands of people.

### D7. Personal vs company audiences
- A personal job's checklist is created from `general`, with every task's audience set to `company` (meaning "the account holder's own"), and nothing is shown on a report.
- A company job's checklist is created from the org template, keeping each task's audience.
- This keeps one table and one API for both.

## Risks / Trade-offs

- **[Scope drift into a to-do app]** → The Non-Goals above, and a review rule: every new checklist feature has to link to boxes, photos or the report.
- **[Report token abuse spams ticks]** → The only possible damage is toggling client tasks on that one job. Rate limits, attribution, and token regeneration contain it.
- **[Search rankings take months]** → Ship the page with the marketing site (launch-plan weeks 4–9). The app and company features don't depend on search traffic.
- **[Email deliverability hurts sign-in OTP]** → Postmark keeps transactional and broadcast streams separate, with DMARC already part of the launch plan.
- **[GDPR consent errors]** → Double opt-in, a stored consent record with the wording version, one-click unsubscribe, deletion of unconfirmed records after 7 days, and a privacy-policy update before launch.

## Migration Plan

- **DB migration:**
  - `jobs.move_date date null`
  - new tables `job_checklist_items`, `org_checklist_templates`, `checklist_subscribers`, `checklist_reminders_sent`
  - RLS policies using `can_access_job` / `org_role`; crew is denied in the policy
- **Release order:**
  1. public page + email
  2. personal in-app checklist
  3. company template and client section

  Each step is behind its own feature flag (an env var for web, a remote config value for mobile), so it can be turned off on its own. To roll back, turn the flags off. The tables can stay.
