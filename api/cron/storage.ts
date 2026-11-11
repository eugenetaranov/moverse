/**
 * GET /api/cron/storage — drains the storage_deletions outbox into R2 deletes
 * (D8). Called by Vercel cron every 10 minutes with `Authorization: Bearer
 * <CRON_SECRET>`; anything else gets 401.
 */
import { json } from "../../lib/http";
import { drainStorageDeletions } from "../../lib/privileged";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET ?? "";
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: "unauthenticated" }, 401);
  }
  try {
    return json(await drainStorageDeletions());
  } catch (err) {
    console.error("moverse_error", "/api/cron/storage", (err as Error)?.message);
    return json({ error: "internal_error" }, 500);
  }
}
