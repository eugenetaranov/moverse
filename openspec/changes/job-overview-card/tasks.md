# Tasks

## 1. Summary logic and data

- [x] 1.1 Add the migration `job_summary(job_id)`, a `stable` SQL function returning the per-status box counts, total boxes, items, photos, unboxed items and undescribed items. Verify with a pgTAP test on a seeded job (19 boxes in mixed statuses, 50 items with 4 unboxed and 3 undescribed) that checks every count, and that another job's rows are excluded.
- [x] 1.2 Implement `deriveSummary(counts)` in `lib/jobSummary.ts`, covering progress weights, stage rules in order, and next-action selection. Verify with a table-driven unit test covering every scenario in `specs/job-overview/spec.md` (including the 55% case and the empty job).
- [x] 1.3 Add the shared fixture table (`lib/jobSummary.fixtures.json`) and a mobile copy, `mobile/src/jobSummary.ts`, tested against the same fixtures. Verify that both test suites pass on identical fixtures.

## 2. API

- [ ] 2.1 Add `GET /jobs/summary` (with `withAuth`, job required) that returns `{ counts, progress, stage, nextAction }`, plus its rewrite in `vercel.json`. Verify with integration tests: an owner gets the summary, crew assigned to the job gets it, crew not assigned gets 403, and a request with no JWT gets 401.

## 3. Mobile card

- [ ] 3.1 Fetch and cache the summary per job alongside `loadInventory`, falling back to `deriveSummary` over the cached inventory with an `offline` flag. Verify with a unit test that a failed fetch returns the cache-derived summary flagged offline.
- [ ] 3.2 Build `screens/JobOverviewCard.tsx`: stage, progress bar, four status tiles, next-action text, attention tiles (shown only when the count is above zero), offline note, and singular/plural copy. Verify visually on a device for a personal job and a company job, including the empty-job state.
- [ ] 3.3 Mount the card as the list header in `BrowseHome.tsx` and refresh it on focus and pull-to-refresh. Verify on a device that sealing a box elsewhere and pulling to refresh updates the counts.
- [ ] 3.4 Add the share action: report link for owners and admins, text summary for personal users, hidden for crew. Verify on a device for each role.

## 4. Browse filters

- [ ] 4.1 Add the box status filter and chip to the Boxes segment, combined with search, and show status on box cards. Verify the "Filter combined with search" and "Clearing the filter" scenarios on a device.
- [ ] 4.2 Add the unboxed and undescribed item filters and their chips. Verify that tapping each attention tile lands on exactly the matching items.

## 5. Client report header

- [ ] 5.1 Render the read-only overview header on the report page using the shared `deriveSummary`, with no attention tiles and no share action. Verify that a seeded Delivering job shows the stage, progress, counts and "2 boxes not delivered", and that a regenerated token shows nothing.
- [ ] 5.2 Keep the header on page one in the print stylesheet and drop the old count line. Verify with a browser print-to-PDF of a 19-box job.

## 6. Integration check

- [ ] 6.1 Run the full flow on staging with a beta-like job: pack, seal, load and deliver boxes. Verify the card and the report agree at each stage, and the offline card matches the online card after a sync.
