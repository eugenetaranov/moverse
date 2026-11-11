// Photo pipeline against the local S3 gateway (design.md D8).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EMAILS, IDS, call, ensureBucket, signIn, sql } from "./helpers";
import uploadUrl from "../../api/photos/upload-url";
import save from "../../api/save";
import items from "../../api/items";
import itemAddPhoto from "../../api/item-add-photo";
import itemDelete from "../../api/item-delete";
import cron from "../../api/cron/storage";

before(ensureBucket);

const jpeg = (n: number) => new Uint8Array(n).fill(0xab);

async function upload(url: string, bytes: number) {
  return fetch(url, { method: "PUT", body: jpeg(bytes), headers: { "content-type": "image/jpeg" } });
}

test("upload-url -> PUT -> save attaches -> presigned GET serves it", async () => {
  const token = await signIn(EMAILS.crew1);
  const photoId = randomUUID();
  const u = await call(uploadUrl, "/photos/upload-url", { token, job: IDS.j1, body: { photoId, bytes: 3000, thumbBytes: 500 } });
  assert.equal(u.status, 200);
  assert.equal(u.body.expiresIn, 900);

  // Retrying the request returns the same pending row.
  const again = await call(uploadUrl, "/photos/upload-url", { token, job: IDS.j1, body: { photoId, bytes: 3000, thumbBytes: 500 } });
  assert.equal(again.status, 200);

  // Not uploaded yet -> 409, so the client re-uploads.
  const early = await call(save, "/save", { token, job: IDS.j1, body: { itemCode: "ITM-0800", boxCode: "BOX-01", photoIds: [photoId] } });
  assert.deepEqual([early.status, early.body.error, early.body.photoIds], [409, "photo_not_uploaded", [photoId]]);

  // The signature binds the size: a different length is refused.
  assert.equal((await upload(u.body.uploadUrl, 2999)).ok, false);
  assert.equal((await upload(u.body.uploadUrl, 3000)).ok, true);
  assert.equal((await upload(u.body.thumbUploadUrl, 500)).ok, true);

  const itemId = randomUUID();
  const s = await call(save, "/save", { token, job: IDS.j1, body: { itemId, itemCode: "ITM-0800", boxCode: "BOX-01", photoIds: [photoId] } });
  assert.equal(s.body.action, "created");
  assert.equal(sql(`select status from photos where id = '${photoId}'`), "ready");

  const list = await call(items, "/items", { token, job: IDS.j1 });
  const item = list.body.items.find((i: any) => i.itemId === itemId);
  assert.notEqual(item.photoThumbUrl, item.photoUrl);
  const got = await fetch(item.photoUrl);
  assert.equal(got.status, 200);
  assert.equal((await got.arrayBuffer()).byteLength, 3000);
});

test("upload-url limits and validation", async () => {
  const token = await signIn(EMAILS.crew1);
  const big = await call(uploadUrl, "/photos/upload-url", { token, job: IDS.j1, body: { photoId: randomUUID(), bytes: 3 * 1024 * 1024, thumbBytes: 100 } });
  assert.equal(big.status, 413);
  const bigThumb = await call(uploadUrl, "/photos/upload-url", { token, job: IDS.j1, body: { photoId: randomUUID(), bytes: 100, thumbBytes: 300 * 1024 } });
  assert.equal(bigThumb.status, 413);
  const bad = await call(uploadUrl, "/photos/upload-url", { token, job: IDS.j1, body: { photoId: "x", bytes: 1, thumbBytes: 1 } });
  assert.equal(bad.body.error, "invalid_photo_id");
  const crew2 = await signIn(EMAILS.crew2);
  const foreign = await call(uploadUrl, "/photos/upload-url", { token: crew2, job: IDS.j1, body: { photoId: randomUUID(), bytes: 1, thumbBytes: 1 } });
  assert.equal(foreign.status, 404);
});

test("item-add-photo appends; delete queues keys; cron drains them from R2", async () => {
  const token = await signIn(EMAILS.admin);
  const photoId = randomUUID();
  const u = await call(uploadUrl, "/photos/upload-url", { token, job: IDS.j1, body: { photoId, bytes: 100, thumbBytes: 10 } });
  await upload(u.body.uploadUrl, 100);
  await upload(u.body.thumbUploadUrl, 10);
  const itemId = "30000000-0000-0000-0000-000000000002";
  assert.equal((await call(itemAddPhoto, "/item-add-photo", { token, job: IDS.j1, body: { itemId, photoIds: [photoId] } })).status, 200);
  const before = (await call(items, "/items", { token, job: IDS.j1 })).body.items.find((i: any) => i.itemId === itemId);
  assert.equal(before.photoUrls.length, 1);

  assert.equal((await call(itemDelete, "/item-delete", { token, job: IDS.j1, body: { itemId } })).body.deleted, 1);
  assert.equal(Number(sql(`select count(*) from storage_deletions where key_or_prefix like '%${photoId}%'`)), 2);

  assert.equal((await call(cron, "/api/cron/storage")).status, 401);
  const drained = await call(cron, "/api/cron/storage", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } });
  assert.equal(drained.status, 200);
  assert.equal(drained.body.failed, 0);
  assert.equal(sql(`select count(*) from storage_deletions where key_or_prefix like '%${photoId}%'`), "0");
  assert.equal((await fetch(before.photoUrl)).status, 404);
});
