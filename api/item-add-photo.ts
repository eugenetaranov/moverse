/**
 * POST /item-add-photo  { itemId, imageBase64 } -> { ok }
 * Appends a photo to an existing item's Photo attachment field.
 * Reachable at /item-add-photo via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleItemAddPhoto } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleItemAddPhoto(req, c);
  } catch (err) {
    console.error("moverse_error", "/item-add-photo", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
