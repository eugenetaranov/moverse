# Tasks

## 1. Template content

- [ ] 1.1 Define the checklist JSON schema (phases, task keys, offsets, action-link enum) and a CI validation step. Verify that CI fails on a fixture with an unknown action destination and passes on valid fixtures.
- [ ] 1.2 Write `content/checklists/general.json` with tasks in all five phases, including "Label and photograph every box" and "Check every box arrived" with action links. Verify that it passes schema validation and that a unit test checks every phase has at least one task.
- [ ] 1.3 Add `dueDate(moveDate, offset)` and phase grouping helpers in `lib/checklist.ts`. Verify with unit tests for the 2027-03-20 / −28 case, the no-move-date case, and phase ordering.

## 2. Public checklist page

- [ ] 2.1 Build `/moving-checklist` in `web/` as a static page from `general.json`, with title, meta, canonical, Open Graph tags, JSON-LD and a sitemap entry. Verify by fetching with JavaScript disabled (all tasks present in the HTML) and running a structured-data validator on the output.
- [ ] 2.2 Add browser-saved ticks, move-date entry, due and overdue states, and reset, all wrapped in try/catch. Verify the reload and blocked-storage scenarios manually in a private window.
- [ ] 2.3 Add the print stylesheet. Verify with print-to-PDF that output has no navigation, shows empty tick boxes and shows due dates when set.
- [ ] 2.4 Add the app call-to-action on action-linked tasks using the smart store / app link, with no prices. Verify on Android with the app installed (opens the app) and without it (opens the store).

## 3. Email reminders

- [ ] 3.1 Migration for `checklist_subscribers` (email, move date, consent source and wording version, confirmed, unsubscribed, tokens) and `checklist_reminders_sent`. Verify that `supabase db push` runs on a local stack and that RLS denies anonymous reads.
- [ ] 3.2 Add `POST /checklist/subscribe` (validation, per-IP rate limit, no information about whether an address exists, no resend for confirmed addresses) and the confirmation email through Postmark's transactional stream. Verify with integration tests for a valid sign-up, a malformed address, an already-confirmed address and the rate limit.
- [ ] 3.3 Add the confirm and unsubscribe pages, plus one-click unsubscribe headers on every email. Verify that confirming sends the checklist email, that a one-click POST unsubscribes, and that the unsubscribed address gets nothing further.
- [ ] 3.4 Add the daily cron that sends due reminders on the broadcast stream, skips reminders already past, records `sent`, and purges unconfirmed records older than 7 days. Verify with a test that simulates the "late sign-up" scenario across days, and that re-running a day sends nothing twice.
- [ ] 3.5 Update the privacy policy and the sub-processor note for the email list. Verify that the sign-up form links to the updated policy.

## 4. Job checklist (data and API)

- [ ] 4.1 Migration: `jobs.move_date`, `job_checklist_items`, `org_checklist_templates`, and RLS with `can_access_job` / `org_role` that denies crew. Verify with pgTAP: owner and admin can read and write, the personal owner can read and write, crew is denied, and other orgs are denied.
- [ ] 4.2 Create the checklist from a template (lazily for personal jobs and existing company jobs, at job creation for new company jobs), recording the template key and version. Verify with integration tests for a personal first open and a company job created after the org template was edited.
- [ ] 4.3 Add `/jobs/checklist` read, tick, add, edit and delete endpoints with idempotent upserts on client UUIDs. Add `moveDate` to job create and update, with due dates computed on read. Verify with integration tests, including a move-date change shifting every due date by 14 days and a replayed tick not creating duplicates.

## 5. In-app checklist (personal)

- [ ] 5.1 Add a Checklist tab for personal users: phases, progress, due and overdue states, and a move-date prompt that can be skipped. Verify on a device on first open with and without a move date.
- [ ] 5.2 Route ticks, adds and edits through the offline save queue and cache the checklist per job. Verify by ticking in airplane mode, reconnecting, and seeing the tick on a second device.
- [ ] 5.3 Add the action-link router (capture, Boxes list, status filter, label printing) and the neutral limit message. Verify that each destination opens correctly, and that at the free limit no price or link is shown.

## 6. Company template and client checklist

- [ ] 6.1 Add the org template editor in the app for owners and admins: add, edit, reorder, delete, and client/company audience. Verify that edits apply to a newly created job and leave existing jobs unchanged.
- [ ] 6.2 Add the "Before your move" section on the report page: client tasks only, grouped by phase, with due dates, company name, and logo when the plan includes branding. Verify with a seeded job (10 client tasks and 6 company tasks) that only the client tasks are shown.
- [ ] 6.3 Add the report-token tick endpoint (client tasks only, attributed, rate-limited, refused for regenerated tokens). Verify with integration tests for the tick, company-task refusal and revoked-token scenarios.
- [ ] 6.4 Add the admin job checklist view in the app: audience markers, attribution, the "Client: X of Y done" line, and ticking company tasks. Verify on a device after the client ticks 7 of 10 tasks on the report.

## 7. Release and integration

- [ ] 7.1 Add separate feature flags for the public page and email, the personal checklist, and the client checklist. Verify that turning each flag off hides its surface without errors.
- [ ] 7.2 End-to-end check on staging: a visitor subscribes and confirms, a personal user packs from a checklist action link, and a company client ticks tasks on the report while the admin watches readiness update. Verify that each step behaves as specified.
