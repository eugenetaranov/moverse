# Job overview card

## Why

Neither a foreman nor a client can see where a move stands without scrolling every box. Questions like "how many boxes are still open?", "is everything on the truck?" and "what didn't arrive?" are the ones a moving company is paid to answer. The box lifecycle (`packing → sealed → loaded → delivered`, `commercial-mvp` task 6.4) records the data, but nothing summarises it. One summary card, shared by the app and the client report, makes progress visible at a glance. It also turns the report into proof of packing and delivery.

## What Changes

- Add a **job overview** summary per job:
  - box counts per lifecycle status (packing, sealed, loaded, delivered)
  - totals for boxes, items and photos
  - items not yet in any box, and items with no description
  - an overall progress figure
  - the job's derived **stage** (Not started, Packing, Loading, In transit, Delivering, Delivered)
  - a single **next action** line, e.g. "3 boxes still open" or "2 boxes not delivered"
- Show the card at the top of the mobile **Browse** screen for the current job. Tapping a status tile opens the Boxes list filtered to that status. Tapping an "attention" tile (unboxed or undescribed items) opens the matching items.
- Show the same card, read-only, at the top of the **client report** page and in its print/PDF header. It replaces the report's plain count line.
- Add a **share** action on the mobile card. For owners and admins it shares the job's report link (the existing share flow). For personal users it shares a text summary.
- Serve the summary from the API as one server-side aggregate per job. When offline, the app computes the same summary from its cached inventory.

## Capabilities

### New Capabilities
- `job-overview`: computing a job's progress summary (status counts, totals, attention counts, stage, next action), plus its presentation in the app and on the client report.

### Modified Capabilities
- `inventory-browsing`: the Boxes list gains a status filter, so the overview tiles can open filtered lists.

## Impact

- **Depends on:**
  - `platform-foundation`: jobs, the job-context header, and inventory on Postgres.
  - `commercial-mvp`: box lifecycle task 6.4 and the `client-report` page. This change adds no status-changing UI of its own.
- **API:** new `GET /jobs/summary` (job from `X-Moverse-Job`). It is also called server-side by the report route using the report token.
- **DB:** one aggregate SQL function. No new tables or columns.
- **Mobile:**
  - `screens/BrowseHome.tsx`: the card, and a status filter on the boxes segment.
  - a new `screens/JobOverviewCard.tsx`
  - a pure `jobSummary.ts` shared by the online and offline paths
  - `inventory.ts`: cache the summary per job
- **Web:** the report page header component and its print stylesheet.
