/**
 * POST /describe  { imageBase64 } -> { description }
 * Reachable at /describe via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleDescribe } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleDescribe(req, c);
  } catch (err) {
    // Never log payloads — they contain photos.
    console.error("moverse_error", "/describe", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
