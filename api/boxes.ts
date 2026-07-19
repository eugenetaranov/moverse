/**
 * GET /boxes  -> { boxes: [{ boxCode, name, type, destination, status, itemCount }] }
 * Reachable at /boxes via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleListBoxes } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c, { methods: ["GET"] });
  if (blocked) return blocked;
  try {
    return await handleListBoxes(c);
  } catch (err) {
    console.error("moverse_error", "/boxes", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
