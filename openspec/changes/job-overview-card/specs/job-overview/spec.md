# Spec Delta

## Purpose

Summarises a job's packing and delivery progress (box lifecycle counts, totals, stage and next action), so crews, company admins and their clients can see where a move stands at a glance.

## ADDED Requirements

### Requirement: Job summary counts

The system SHALL compute, for a single job:
- the number of boxes in each lifecycle status (`packing`, `sealed`, `loaded`, `delivered`) and the total number of boxes;
- the total numbers of items and of photos;
- the number of items linked to no box;
- the number of items with an empty description.

Archived jobs SHALL still produce a summary. Counts SHALL only include rows belonging to that job.

#### Scenario: Counts reflect box statuses

- **WHEN** a job has 19 boxes: 2 packing, 3 sealed, 4 loaded and 10 delivered
- **THEN** the summary reports packing 2, sealed 3, loaded 4, delivered 10 and total boxes 19

#### Scenario: Unboxed and undescribed items are counted

- **WHEN** a job has 50 items, of which 4 are in no box and 3 have an empty description
- **THEN** the summary reports 50 items, 4 unboxed items and 3 undescribed items

#### Scenario: Other jobs are excluded

- **WHEN** the same org has another job with 30 boxes
- **THEN** none of those boxes appear in this job's summary

### Requirement: Progress figure

The summary SHALL include a progress percentage based on each box's lifecycle step:

| Status | Weight |
|---|---|
| packing | 0 |
| sealed | 1/3 |
| loaded | 2/3 |
| delivered | 1 |

The percentage SHALL be the average weight across the job's boxes, rounded down to a whole percent. A job with no boxes SHALL report 0%.

#### Scenario: Mixed statuses

- **WHEN** a job has 3 boxes, one packing, one loaded and one delivered
- **THEN** the progress is 55%

#### Scenario: Everything delivered

- **WHEN** every box in the job is delivered
- **THEN** the progress is 100%

### Requirement: Derived job stage

The summary SHALL include exactly one stage. The rules SHALL be applied in this order, and the first rule that matches SHALL win:

| # | Condition | Stage |
|---|---|---|
| 1 | The job has no boxes and no items | Not started |
| 2 | Every box is delivered | Delivered |
| 3 | At least one box is delivered | Delivering |
| 4 | At least one box is `packing`, or there are items but no boxes | Packing |
| 5 | Every box is loaded | In transit |
| 6 | Otherwise | Loading |

#### Scenario: Packing in progress

- **WHEN** a job has 5 sealed boxes and 1 box still packing
- **THEN** the stage is Packing

#### Scenario: Loading

- **WHEN** all boxes are sealed or loaded and at least one is still only sealed
- **THEN** the stage is Loading

#### Scenario: Partly delivered

- **WHEN** 17 of 19 boxes are delivered
- **THEN** the stage is Delivering

### Requirement: Next action line

The summary SHALL include at most one plain-language **next action**, chosen by stage.

| Stage | Next action |
|---|---|
| Not started | Prompt to add the first item |
| Packing | The number of boxes still open |
| Packing, with no box open | The number of unboxed items |
| Loading | The number of sealed boxes not yet loaded |
| In transit | None |
| Delivering | The number of boxes not yet delivered |
| Delivered | None |

Counts in the text SHALL use correct singular and plural forms.

#### Scenario: Open boxes during packing

- **WHEN** the stage is Packing and 3 boxes are still `packing`
- **THEN** the next action reads "3 boxes still open"

#### Scenario: Delivery reconciliation

- **WHEN** the stage is Delivering and 2 boxes are not delivered
- **THEN** the next action reads "2 boxes not delivered"

#### Scenario: Nothing left to do

- **WHEN** the stage is Delivered
- **THEN** no next action is shown

### Requirement: Summary is authorised like inventory reads

The job summary SHALL be available only to callers who can read the job's inventory, through the job context or through the job's valid report token. A crew member SHALL get summaries only for jobs assigned to them. A revoked or regenerated report token SHALL NOT return a summary.

#### Scenario: Crew on an unassigned job

- **WHEN** a crew member requests the summary of a job they are not assigned to
- **THEN** the request is refused and no counts are returned

#### Scenario: Old report link

- **WHEN** a client opens a report link whose token was regenerated
- **THEN** no summary or report content is shown

### Requirement: Overview card in the app

The app SHALL show the current job's overview card at the top of the Browse screen. The card SHALL contain:
- the job name (omitted for a personal user with a single job);
- the stage;
- a progress bar with its percentage;
- one tile per box status with its count;
- the next action;
- attention tiles for unboxed and undescribed items, shown only when their count is above zero.

The card SHALL refresh with the rest of Browse, including pull-to-refresh.

#### Scenario: Card on entering Browse

- **WHEN** a user opens Browse for a job with boxes
- **THEN** the overview card appears above the boxes/items lists with the current counts, stage, progress and next action

#### Scenario: No attention tiles when clean

- **WHEN** every item is in a box and has a description
- **THEN** no unboxed or undescribed tiles are shown

### Requirement: Card tiles open filtered lists

Tapping a box-status tile SHALL open the Boxes list filtered to that status. Tapping the unboxed tile SHALL open the Items list filtered to items in no box. Tapping the undescribed tile SHALL open the Items list filtered to items with an empty description.

#### Scenario: Tap the "loaded" tile

- **WHEN** the user taps the loaded tile showing 4
- **THEN** the Boxes list shows exactly those 4 loaded boxes, with a visible, clearable filter

#### Scenario: Tap the unboxed tile

- **WHEN** the user taps the unboxed tile showing 4
- **THEN** the Items list shows exactly those 4 items

### Requirement: Card works offline

When the summary cannot be fetched, the app SHALL compute the same summary from its cached inventory for the current job, with identical counting, stage and next-action rules. The card SHALL indicate that it may be out of date.

#### Scenario: Basement with no signal

- **WHEN** the device is offline and the job's inventory is cached
- **THEN** the card shows counts computed from the cache and an "offline — may be out of date" note

### Requirement: Share from the card

The card SHALL offer a share action.
- For company owners and admins it SHALL share the job's client report link.
- For personal users it SHALL share a plain-text summary: job name, stage, box counts per status and item count.
- Crew SHALL NOT see the share action.

#### Scenario: Admin shares progress

- **WHEN** an admin taps share on the card
- **THEN** the system share sheet opens with the job's report link

#### Scenario: Personal user shares progress

- **WHEN** a personal user taps share
- **THEN** the share sheet opens with a text summary such as "My move — Packing: 12 boxes (3 open, 9 sealed), 140 items"

### Requirement: Overview on the client report

The client report page SHALL show the overview as a read-only header: stage, progress, per-status box counts and next action. It SHALL show no attention tiles and no share action. The report's print/PDF layout SHALL include the same header on page one.

#### Scenario: Client views progress

- **WHEN** a client opens a valid report link for a job in the Delivering stage
- **THEN** the top of the page shows the stage, the progress percentage, the per-status counts and "2 boxes not delivered"

#### Scenario: Printed report

- **WHEN** the client prints the report to PDF
- **THEN** page one starts with the overview header, followed by the boxes
