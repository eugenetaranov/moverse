# photo-storage Delta

## ADDED Requirements

### Requirement: Direct-to-storage photo upload

Item photos SHALL be stored in Cloudflare R2, uploaded directly from the app with presigned PUT URLs and never through the API body. For each photo the app SHALL produce a full image (1024 px long edge) and a thumbnail (320 px), and generate the photo id. `POST /photos/upload-url` SHALL record a pending photo for the current job under a server-built key `org/{org}/job/{job}/photo/{id}` and return short-lived upload URLs bound to JPEG content type and the declared size. Full images over 2 MB or thumbnails over 200 KB SHALL be refused. Repeating the request with the same photo id SHALL return the same record.

#### Scenario: Upload a photo

- **WHEN** the app requests upload URLs for a new photo id and PUTs both files
- **THEN** both objects exist in R2 under the job's prefix and the photo is pending

#### Scenario: Oversized upload refused

- **WHEN** the app declares a 5 MB full image
- **THEN** the API responds 413 and issues no URL

#### Scenario: Client cannot choose the key

- **WHEN** a request tries to supply its own storage path
- **THEN** the path is ignored and the server-built key is used

### Requirement: Photos attach on save after verification

When `/save` or `/item-add-photo` references photo ids, the API SHALL confirm that each object exists in R2 before attaching the photo to the item and marking it ready. A missing object SHALL fail with `photo_not_uploaded` so the client can re-upload. Pending photos never attached within 24 hours SHALL be deleted with their objects.

#### Scenario: Save before upload finished

- **WHEN** `/save` references a photo whose object is not in R2 yet
- **THEN** the API responds 409 `photo_not_uploaded` and the item is not saved

#### Scenario: Orphan cleanup

- **WHEN** a pending photo is 24 hours old and was never attached
- **THEN** the cleanup job deletes its row and both objects

### Requirement: Photo serving and deletion

Read endpoints SHALL return photo and thumbnail URLs as presigned GET URLs valid for 1 hour, and the bucket SHALL NOT be public. Deleting a photo, item, job, org or account SHALL record the affected keys or prefixes in a deletion queue in the same transaction, and a scheduled job SHALL delete them from R2 within 15 minutes.

#### Scenario: Photo URL expires

- **WHEN** a photo URL from a previous session is used after 1 hour
- **THEN** R2 refuses it, and the app gets fresh URLs by reloading the list

#### Scenario: Deleted item's photos are purged

- **WHEN** an admin deletes an item with two photos
- **THEN** the item disappears immediately and its four objects (two full images, two thumbnails) are removed from R2 by the next cleanup run
