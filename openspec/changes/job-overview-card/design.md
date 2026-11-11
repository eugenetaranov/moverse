# Design

## Context

- **Schema:** `supabase/migrations/0001_schema.sql` already has `boxes.status` (`box_status` enum), `item_boxes` and `photos`, all scoped by `job_id`.
- **Dependencies:** this change builds on `platform-foundation` and `commercial-mvp`:
  - `withAuth` and the job-context header (`platform-foundation`)
  - the RLS helpers `can_access_job` (`platform-foundation`)
  - the client report route `web/report/<token>` (`commercial-mvp`)
  - box status transitions, task 6.4 (`commercial-mvp`)
- **Mobile today:** the app loads the full inventory for the job into a cache (`mobile/src/inventory.ts` → `loadInventory`). `BrowseHome.tsx` renders the Boxes and Items segments from that cache.

## Goals / Non-Goals

**Goals:**
- One definition of the counts, stage and next action, used everywhere: API, offline app and report.
- Cheap enough to run on every Browse load and every report view.

**Non-Goals:**
- UI for changing box status (that is `commercial-mvp` task 6.4).
- Live push updates; refresh is enough (as in `commercial-mvp` Non-Goals).
- An org-wide dashboard across jobs.
- Historical timelines ("sealed at 14:02").

## Decisions

### D1. Counts in SQL; stage and next action in one shared TypeScript function
- **SQL:** `job_summary(job_id uuid)` is a `stable` SQL function that returns the raw counts in one pass:
  - boxes: a `count(*) filter (where status = …)` for each status
  - items: total, unboxed (`not exists` in `item_boxes`), undescribed (`btrim(description) = ''`)
  - photos: a count joined through `items`
- **TypeScript:** a single pure function `deriveSummary(counts)` in `lib/jobSummary.ts` calculates progress, stage and next action.
  - The API and the web report import it.
  - The mobile app gets a copy (`mobile/src/jobSummary.ts`) with a shared test fixture table, so the online and offline results can't drift.
  - The function stays dependency-free so it can be shared directly later, if a workspace package is set up.
- **Why the split:** the counting has to be done where the rows live. The stage and wording rules are product logic that changes often, and is easier to unit-test in TypeScript.
- **Alternative rejected: compute everything client-side from the full inventory.** It works for personal jobs, but the report page would have to load every item just to show a header, and large company jobs (1,000+ items) would make the API response heavy.
- **Alternative rejected: store counters on `jobs`, updated by triggers.** It is cheaper to read, but triggers on four tables add write contention while crews pack at the same time, and the counters can drift. The indexed aggregate is fast enough at expected job sizes (hundreds to low thousands of rows).

### D2. Endpoint and authorisation
- **App endpoint:** `GET /jobs/summary` is wrapped in `withAuth({ job: 'required' })`. It calls `job_summary` through the user-scoped client, so RLS (`can_access_job`) applies. A crew member asking about an unassigned job gets the same 403 as for any inventory read.
- **Report route:** it resolves the job from the hashed report token in a privileged module, which is already needed for the report body, and calls `job_summary` server-side. The token is never exposed to the summary endpoint.
- **Response:** `{ counts, progress, stage, nextAction: { kind, count } | null }`. Clients turn `nextAction` into text, so the copy can be localised later without changing the API.

### D3. Mobile placement and filters
- **Placement:** the `JobOverviewCard` is the list header of the Browse `FlatList`, so it scrolls away and doesn't take up packing screen space.
- **Data loading:** the summary is fetched alongside `loadInventory` and cached per job. If the fetch fails, `deriveSummary(countsFromCache(inventory))` is used and an offline note is shown.
- **Filters:** tiles set a `statusFilter` or `itemFilter` state in `BrowseHome` and switch the segment. The filter shows as a chip next to the search field.
- **Alternative rejected: a separate Job screen.** It adds a navigation step, while a header puts the overview where users already are.

### D4. Report header
- The report page renders the same summary as a read-only header component.
- The print stylesheet keeps it on page one.
- It replaces the plain "N boxes / M items / generated at" line from the `client-report` printable-layout requirement; the generation date stays.

## Risks / Trade-offs

- **[The offline copy differs from the server]** → Both versions are tested against the same fixture table. A divergence can only come from stale cache data, which the offline note already explains.
- **[The aggregate gets slow on very large jobs]** → `boxes_job_idx`, `items_job_idx` and `item_boxes_box_idx` already exist. If p95 latency goes above 100 ms, add `item_boxes(item_id)` and a covering index for status.
- **[Stage rules don't match how movers talk]** → The rules live in one TypeScript function. Validate the wording with the beta companies; changing the copy needs no API change.
- **[Box status is rarely updated, so the card shows "Packing" forever]** → This depends on the quality of task 6.4 (scan-driven check-off). Watch the beta: if most jobs never leave Packing, the check-off flow needs work, not this card.

## Migration Plan

This change is additive: one SQL function migration, one new endpoint, and new UI. To roll back, hide the card and drop the function. No data changes.
