# item-capture Delta

## MODIFIED Requirements

### Requirement: Guided item capture workflow

The app SHALL guide the user through capturing a packed item in this order: (1) scan the item's `ITM-` QR label (or take a minted code in codeless mode), (2) take a photo of the item, (3) confirm or edit the auto-generated description, (4) scan or select the destination `BOX-` label, (5) save. Saves SHALL go through the durable offline queue: the flow confirms success immediately and returns to step 1, with syncing handled in the background. In crew mode the job is pre-selected and cannot be changed from the capture flow.

#### Scenario: Complete capture end to end

- **WHEN** the user scans an item label, takes a photo, accepts the description, and scans a box label, then confirms save
- **THEN** the save is queued (or synced when online), a success confirmation is shown, and the app returns to the item-scan step

#### Scenario: Save failure is recoverable

- **WHEN** the network is unavailable or the sync request fails
- **THEN** the capture is preserved in the local queue, the user continues packing uninterrupted, and the item syncs automatically later without re-capturing

#### Scenario: Crew capture is job-locked

- **WHEN** a crew member runs the capture flow
- **THEN** every save lands in their invited job and no job selection is offered
