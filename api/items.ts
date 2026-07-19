/**
 * GET /items[?box=BOX-####]
 *   -> { items: [{ itemId, itemCode, description, photoUrl, photoThumbUrl, boxCodes[], destination }] }
 * Reachable at /items via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleListItems } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c, { methods: ["GET"] });
  if (blocked) return blocked;
  try {
    return await handleListItems(req, c);
  } catch (err) {
    console.error("moverse_error", "/items", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
