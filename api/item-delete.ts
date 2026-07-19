/**
 * POST /item-delete  { itemId } -> { ok }
 * Delete an item record. Reachable at /item-delete via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleItemDelete } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleItemDelete(req, c);
  } catch (err) {
    console.error("moverse_error", "/item-delete", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
