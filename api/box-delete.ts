/**
 * POST /box-delete  { boxCode } -> { ok, deleted }
 * Delete a box by its code (items keep existing). Reachable at /box-delete via
 * the rewrite in vercel.json.
 */
import { cfg, guard, json, handleBoxDelete } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleBoxDelete(req, c);
  } catch (err) {
    console.error("moverse_error", "/box-delete", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
