// Inventory routes on Postgres. Response shapes are the contract from the
// Airtable implementation (task 3.1): the app must not notice the port.
import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { EMAILS, IDS, call, signIn, sql } from "./helpers";
import save from "../../api/save";
import items from "../../api/items";
import boxes from "../../api/boxes";
import itemUpdate from "../../api/item-update";
import boxUpdate from "../../api/box-update";
import itemDelete from "../../api/item-delete";
import boxDelete from "../../api/box-delete";
import nextCode from "../../api/next-code";
import nextBoxCode from "../../api/next-box-code";
import reserve from "../../api/codes/reserve";

const job = IDS.j2; // J2 is ours to mutate; J1 stays as seeded for other suites.

test("/boxes contract shape, labels and sort", async () => {
  const token = await signIn(EMAILS.owner);
  const r = await call(boxes, "/boxes", { token, job: IDS.j1 });
  assert.equal(r.status, 200);
  assert.deepEqual(Object.keys(r.body), ["boxes"]);
  assert.deepEqual(r.body.boxes.map((b: any) => b.boxCode), ["BOX-03", "BOX-02", "BOX-01"]);
  assert.deepEqual(r.body.boxes[2], {
    boxCode: "BOX-01", name: "Kitchen", type: "Shipping box", destination: "Shipment",
    status: "sealed", itemCount: 2,
  });
  assert.equal(r.body.boxes[0].type, "Suitcase");
  assert.equal(r.body.boxes[0].destination, "With me");
});

test("/items contract shape and box filter", async () => {
  const token = await signIn(EMAILS.crew1);
  const r = await call(items, "/items", { token, job: IDS.j1 });
  assert.equal(r.status, 200);
  const kettle = r.body.items.find((i: any) => i.itemCode === "ITM-0001");
  assert.deepEqual(Object.keys(kettle).sort(), [
    "boxCodes", "description", "destination", "itemCode", "itemId", "photoThumbUrl", "photoUrl", "photoUrls",
  ]);
  assert.equal(kettle.itemId, IDS.j1Item1);
  assert.deepEqual(kettle.boxCodes, ["BOX-01"]);
  assert.equal(kettle.destination, "Shipment");
  assert.match(kettle.photoUrl, /X-Amz-Signature=/);
  assert.equal(kettle.photoUrls.length, 1);
  const unboxed = r.body.items.find((i: any) => i.itemCode === "ITM-0004");
  assert.deepEqual([unboxed.boxCodes, unboxed.photoUrl, unboxed.destination], [[], "", ""]);
  assert.deepEqual(r.body.items.map((i: any) => i.itemCode).slice(0, 2), ["ITM-0004", "ITM-0003"]);

  const filtered = await call(items, "/items", { token, job: IDS.j1, query: { box: "BOX-01" } });
  assert.deepEqual(filtered.body.items.map((i: any) => i.itemCode).sort(), ["ITM-0001", "ITM-0002"]);
});

test("/save: created, replay exists, code union added, codeless mint", async () => {
  const token = await signIn(EMAILS.owner);
  const itemId = randomUUID();
  const a = await call(save, "/save", { token, job, body: { itemId, itemCode: "ITM-0042", boxCode: "BOX-01", description: "Vase" } });
  assert.deepEqual(a.body, { ok: true, itemId, itemCode: "ITM-0042", boxCode: "BOX-01", action: "created" });

  const replay = await call(save, "/save", { token, job, body: { itemId, itemCode: "ITM-0042", boxCode: "BOX-01" } });
  assert.equal(replay.body.action, "exists");

  const union = await call(save, "/save", { token, job, body: { itemId: randomUUID(), itemCode: "ITM-0042", boxCode: "Garage shelf" } });
  assert.deepEqual([union.body.action, union.body.itemId], ["added", itemId]);

  const minted = await call(save, "/save", { token, job, body: { itemId: randomUUID(), newBox: true, description: "Rake" } });
  assert.deepEqual([minted.body.itemCode, minted.body.boxCode, minted.body.action], ["ITM-0043", "BOX-02", "created"]);

  const missing = await call(save, "/save", { token, job, body: { itemCode: "ITM-0099" } });
  assert.deepEqual([missing.status, missing.body.error], [400, "missing_box"]);
});

test("/item-update and /box-update", async () => {
  const token = await signIn(EMAILS.owner);
  const id = "30000000-0000-0000-0000-000000000011";
  assert.equal((await call(itemUpdate, "/item-update", { token, job, body: { itemId: id, description: "Cordless drill", boxCodes: ["BOX-01", "Tools"] } })).status, 200);
  const r = await call(items, "/items", { token, job });
  const drill = r.body.items.find((i: any) => i.itemId === id);
  assert.deepEqual([drill.description, drill.boxCodes], ["Cordless drill", ["BOX-01", "Tools"]]);

  assert.equal((await call(itemUpdate, "/item-update", { token, job, body: { itemId: id } })).body.error, "nothing_to_update");

  const u = await call(boxUpdate, "/box-update", { token, job, body: { boxCode: "Tools", type: "Suitcase", destination: "With me", status: "sealed" } });
  assert.equal(u.status, 200);
  const b = (await call(boxes, "/boxes", { token, job })).body.boxes.find((x: any) => x.boxCode === "Tools");
  assert.deepEqual([b.type, b.destination, b.status], ["Suitcase", "With me", "sealed"]);
  assert.notEqual(sql(`select sealed_at from boxes where job_id = '${job}' and code = 'Tools'`), "");

  assert.equal((await call(boxUpdate, "/box-update", { token, job, body: { boxCode: "Tools", type: "Crate" } })).body.error, "invalid_type");
});

test("codes: reserve ranges are disjoint; compatibility endpoints", async () => {
  const token = await signIn(EMAILS.admin);
  const a = await call(reserve, "/codes/reserve", { token, job, body: { kind: "item", count: 50 } });
  const b = await call(reserve, "/codes/reserve", { token, job, body: { kind: "item", count: 50 } });
  assert.equal(b.body.first, a.body.last + 1);
  assert.equal(a.body.format, "ITM-nnnn");
  assert.equal((await call(reserve, "/codes/reserve", { token, job, body: { kind: "item", count: 500 } })).body.error, "invalid_count");
  const n = await call(nextCode, "/next-code", { token, job, body: {} });
  assert.equal(n.body.nextCode, `ITM-${String(b.body.last + 1).padStart(4, "0")}`);
  const nb = await call(nextBoxCode, "/next-box-code", { token, job, body: {} });
  assert.match(nb.body.nextBoxCode, /^BOX-\d{2,}$/);
});

test("deletes: admin only; box delete keeps items", async () => {
  const crew = await signIn(EMAILS.crew1);
  assert.equal((await call(boxDelete, "/box-delete", { token: crew, job: IDS.j1, body: { boxCode: "BOX-01" } })).status, 403);

  const admin = await signIn(EMAILS.admin);
  const del = await call(boxDelete, "/box-delete", { token: admin, job, body: { boxCode: "Tools" } });
  assert.deepEqual(del.body, { ok: true, deleted: true });
  assert.equal(sql(`select count(*) from items where id = '30000000-0000-0000-0000-000000000011'`), "1");

  const gone = await call(itemDelete, "/item-delete", { token: admin, job, body: { itemIds: ["30000000-0000-0000-0000-000000000011"] } });
  assert.deepEqual(gone.body, { ok: true, deleted: 1 });
  // An id from another job is skipped, not deleted.
  const foreign = await call(itemDelete, "/item-delete", { token: admin, job, body: { itemId: IDS.j1Item1 } });
  assert.equal(foreign.body.deleted, 0);
});
