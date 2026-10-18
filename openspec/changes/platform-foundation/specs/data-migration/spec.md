# data-migration Delta

## ADDED Requirements

### Requirement: Re-runnable Airtable import

A migration script SHALL import the existing Airtable base into a given job, normally the founder's "My move" job:

- Boxes, with codes kept verbatim and type and destination mapped.
- Items with their box links.
- Every photo attachment, downloaded and uploaded to R2 with a generated thumbnail.

Record ids SHALL be derived deterministically from Airtable record ids, so re-running the script updates rather than duplicates. After import, the job's item and box sequences SHALL be set to the highest numeric codes.

#### Scenario: Re-run does not duplicate

- **WHEN** the script runs twice against the same job
- **THEN** item, box and photo counts are the same as after the first run

#### Scenario: Next code after import

- **WHEN** the highest imported item code is `ITM-0412`
- **THEN** the next minted or reserved item code in that job is `ITM-0413`

### Requirement: Parity report and cutover

The script SHALL print a parity report: counts per entity in Airtable vs Postgres, items without a box, photos per item, and failed downloads. It SHALL exit non-zero on any difference. Cutover SHALL:

1. Freeze Airtable writes.
2. Run the import against production with a clean parity report.
3. Switch the app to the new API.

The frozen Airtable base and the previous API deployment SHALL be kept for 30 days as the rollback path.

#### Scenario: Missing photo blocks cutover

- **WHEN** one Airtable photo fails to download
- **THEN** the report lists it, the script exits non-zero, and cutover does not proceed
