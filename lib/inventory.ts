/**
 * Inventory routes on Postgres (design.md D9). Request and response shapes
 * match the old Airtable implementation, so the app's flows don't change:
 * box type/destination still travel as display labels ("Shipping box",
 * "With me"), and photo URLs are short-lived presigned R2 GETs.
 */
import type { AuthedCtx } from "./auth";
import { rpc, must } from "./db";
import { ApiError, isUuid, json, readJson, requireUuid } from "./http";
import { headObject, presignGet } from "./r2";

/* ---------------- enum <-> label mapping ---------------- */

const TYPE_LABEL = { suitcase: "Suitcase", shipping_box: "Shipping box" } as const;
const DEST_LABEL = { with_me: "With me", shipment: "Shipment" } as const;
const STATUSES = ["packing", "sealed", "loaded", "delivered"] as const;

function fromLabel<T extends string>(map: Record<T, string>, v: string, code: string): T {
  const norm = v.trim().toLowerCase();
  for (const [k, label] of Object.entries(map) as [T, string][]) {
    if (norm === k || norm === label.toLowerCase()) return k;
  }
  throw new ApiError(400, code);
}

/* ---------------- /save ---------------- */

interface SaveBody {
  itemId?: string;
  itemCode?: string;
  boxCode?: string;
  newBox?: boolean;
  description?: string;
  photoIds?: string[];
}

/** 409 photo_not_uploaded if any photo object is missing in R2. */
async function verifyUploaded(ctx: AuthedCtx, photoIds: string[]): Promise<void> {
  if (photoIds.length === 0) return;
  const rows = must(
    await ctx.db.from("photos").select("id, storage_path").eq("job_id", ctx.job.id).in("id", photoIds),
  ) as { id: string; storage_path: string }[];
  if (rows.length !== photoIds.length) throw new ApiError(404, "photo_not_found");
  const present = await Promise.all(rows.map((r) => headObject(r.storage_path)));
  const missing = rows.filter((_, i) => !present[i]).map((r) => r.id);
  if (missing.length) throw new ApiError(409, "photo_not_uploaded", { photoIds: missing });
}

function photoIdsOf(v: unknown): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > 20 || !v.every(isUuid)) throw new ApiError(400, "invalid_photo_ids");
  return v as string[];
}

export async function handleSave(req: Request, ctx: AuthedCtx): Promise<Response> {
  const body = await readJson<SaveBody>(req);
  const itemId = body.itemId === undefined ? crypto.randomUUID() : requireUuid(body.itemId, "invalid_item_id");
  const photoIds = photoIdsOf(body.photoIds);
  await verifyUploaded(ctx, photoIds);
  const result = await rpc<Record<string, unknown>>(ctx.db, "save_item", {
    p_job: ctx.job.id,
    p_item_id: itemId,
    p_item_code: body.itemCode ?? null,
    p_box_code: body.boxCode ?? null,
    p_new_box: body.newBox === true,
    p_description: body.description ?? "",
    p_photo_ids: photoIds,
  });
  return json(result);
}

/* ---------------- /item-add-photo ---------------- */

export async function handleItemAddPhoto(req: Request, ctx: AuthedCtx): Promise<Response> {
  const body = await readJson<{ itemId?: string; photoIds?: string[] }>(req);
  const itemId = requireUuid(body.itemId, "missing_item");
  const photoIds = photoIdsOf(body.photoIds);
  if (photoIds.length === 0) throw new ApiError(400, "missing_image");
  await verifyUploaded(ctx, photoIds);
  await rpc(ctx.db, "attach_photos", { p_job: ctx.job.id, p_item_id: itemId, p_photo_ids: photoIds });
  return json({ ok: true });
}

/* ---------------- /boxes ---------------- */

interface BoxRow {
  boxCode: string;
  name: string;
  type: keyof typeof TYPE_LABEL | null;
  destination: keyof typeof DEST_LABEL | null;
  status: string;
  itemCount: number;
}

export async function handleListBoxes(_req: Request, ctx: AuthedCtx): Promise<Response> {
  const rows = await rpc<BoxRow[]>(ctx.db, "list_boxes", { p_job: ctx.job.id });
  const boxes = rows.map((b) => ({
    ...b,
    type: b.type ? TYPE_LABEL[b.type] : "",
    destination: b.destination ? DEST_LABEL[b.destination] : "",
  }));
  return json({ boxes });
}

/* ---------------- /items ---------------- */

interface ItemRow {
  itemId: string;
  itemCode: string;
  description: string;
  boxCodes: string[];
  destination: keyof typeof DEST_LABEL | null;
  photos: { path: string; thumb: string | null }[];
}

export async function handleListItems(req: Request, ctx: AuthedCtx): Promise<Response> {
  const box = new URL(req.url).searchParams.get("box")?.trim() || null;
  const rows = await rpc<ItemRow[]>(ctx.db, "list_items", { p_job: ctx.job.id, p_box_code: box });
  const items = await Promise.all(
    rows.map(async (r) => {
      const urls = await Promise.all(r.photos.map((p) => presignGet(p.path)));
      const first = r.photos[0];
      return {
        itemId: r.itemId,
        itemCode: r.itemCode,
        description: r.description,
        photoUrl: urls[0] ?? "",
        photoThumbUrl: first ? (first.thumb ? await presignGet(first.thumb) : urls[0]) : "",
        photoUrls: urls,
        boxCodes: r.boxCodes,
        destination: r.destination ? DEST_LABEL[r.destination] : "",
      };
    }),
  );
  return json({ items });
}

/* ---------------- /item-update ---------------- */

export async function handleItemUpdate(req: Request, ctx: AuthedCtx): Promise<Response> {
  const { itemId, description, boxCodes } = await readJson<{
    itemId?: string;
    description?: string;
    boxCodes?: string[];
  }>(req);
  if (!isUuid(itemId)) throw new ApiError(400, "missing_item");
  if (boxCodes !== undefined && (!Array.isArray(boxCodes) || !boxCodes.every((c) => typeof c === "string"))) {
    throw new ApiError(400, "invalid_box_codes");
  }
  await rpc(ctx.db, "update_item", {
    p_job: ctx.job.id,
    p_item_id: itemId,
    p_description: typeof description === "string" ? description : null,
    p_box_codes: Array.isArray(boxCodes) ? boxCodes : null,
  });
  return json({ ok: true });
}

/* ---------------- /box-update ---------------- */

export async function handleBoxUpdate(req: Request, ctx: AuthedCtx): Promise<Response> {
  const { boxCode, name, type, destination, status } = await readJson<{
    boxCode?: string;
    name?: string;
    type?: string;
    destination?: string;
    status?: string;
  }>(req);
  if (!boxCode || !boxCode.trim()) throw new ApiError(400, "missing_box");
  let st: string | null = null;
  if (typeof status === "string") {
    st = status.trim().toLowerCase();
    if (!(STATUSES as readonly string[]).includes(st)) throw new ApiError(400, "invalid_status");
  }
  await rpc(ctx.db, "update_box", {
    p_job: ctx.job.id,
    p_box_code: boxCode.trim(),
    p_name: typeof name === "string" ? name : null,
    p_type: typeof type === "string" ? fromLabel(TYPE_LABEL, type, "invalid_type") : null,
    p_destination:
      typeof destination === "string" ? fromLabel(DEST_LABEL, destination, "invalid_destination") : null,
    p_status: st,
  });
  return json({ ok: true });
}

/* ---------------- /item-delete, /box-delete ---------------- */

// { itemId } (single) or { itemIds } (bulk, from multi-select).
export async function handleItemDelete(req: Request, ctx: AuthedCtx): Promise<Response> {
  const { itemId, itemIds } = await readJson<{ itemId?: string; itemIds?: string[] }>(req);
  const ids = itemIds ?? (itemId ? [itemId] : []);
  if (ids.length === 0 || ids.length > 500 || !ids.every(isUuid)) throw new ApiError(400, "missing_item");
  const deleted = await rpc<number>(ctx.db, "delete_items", { p_job: ctx.job.id, p_ids: ids });
  return json({ ok: true, deleted });
}

export async function handleBoxDelete(req: Request, ctx: AuthedCtx): Promise<Response> {
  const { boxCode } = await readJson<{ boxCode?: string }>(req);
  if (!boxCode || !boxCode.trim()) throw new ApiError(400, "missing_box");
  const deleted = await rpc<boolean>(ctx.db, "delete_box", { p_job: ctx.job.id, p_box_code: boxCode.trim() });
  return json({ ok: true, deleted });
}
