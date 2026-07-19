/**
 * POST /box-update  { boxCode, name?, type?, destination?, status? } -> { ok }
 * Edit a box's metadata from the browse box-detail screen. Reachable at
 * /box-update via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleBoxUpdate } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleBoxUpdate(req, c);
  } catch (err) {
    console.error("moverse_error", "/box-update", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
