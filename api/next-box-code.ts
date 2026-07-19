/**
 * POST /next-box-code  -> { nextBoxCode }
 * The next BOX-#### code, one above the highest numeric box code in Airtable.
 * Reachable at /next-box-code via the rewrite in vercel.json.
 */
import { cfg, guard, json, handleNextBoxCode } from "../lib/moverse";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const c = cfg();
  const blocked = guard(req, c);
  if (blocked) return blocked;
  try {
    return await handleNextBoxCode(c);
  } catch (err) {
    console.error("moverse_error", "/next-box-code", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
