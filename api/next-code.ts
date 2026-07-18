/**
 * POST /next-code  -> { nextCode }
 * The next ITM-#### code, one above the highest numeric item code in Airtable.
 * Reachable at /next-code via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleNextCode } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleNextCode(c);
  } catch (err) {
    console.error("moverse_error", "/next-code", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
