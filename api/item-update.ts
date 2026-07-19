/**
 * POST /item-update  { itemId, description?, boxCodes? } -> { ok }
 * Light edits from the browse detail screens. Reachable at /item-update via the
 * rewrite in vercel.json.
 */
import { cfg, guard, json, handleItemUpdate } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleItemUpdate(req, c);
  } catch (err) {
    // Never log payloads.
    console.error("moverse_error", "/item-update", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
