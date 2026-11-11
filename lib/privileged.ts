/**
 * The ONLY place the Supabase service role is used (design.md D6). It exports
 * a fixed set of operations that can't be done as the user:
 *
 *   deleteAuthUser        — account deletion (auth admin API)
 *   drainStorageDeletions — the R2 outbox cron
 *
 * Imports are allow-listed by lib/privileged.test.ts: only api/account/delete,
 * api/cron/* and scripts/* may use this module.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { deleteKeys, listKeys } from "./r2";

let admin: SupabaseClient | null = null;

function serviceClient(): SupabaseClient {
  if (!admin) {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
    if (!key) throw new Error("service_role_not_configured");
    admin = createClient(env().supabaseUrl, key, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
  }
  return admin;
}

export async function deleteAuthUser(userId: string): Promise<void> {
  const { error } = await serviceClient().auth.admin.deleteUser(userId);
  if (error) throw new Error(`delete_user_failed: ${error.message}`);
}

interface DeletionRow {
  id: number;
  key_or_prefix: string;
  is_prefix: boolean;
  attempts: number;
}

/**
 * Drain storage_deletions: delete each key (or every key under a prefix) in
 * R2, then the queue row. Failures bump `attempts` and stay queued.
 */
export async function drainStorageDeletions(limit = 200): Promise<{ done: number; failed: number }> {
  const db = serviceClient();
  const { data, error } = await db
    .from("storage_deletions")
    .select("id, key_or_prefix, is_prefix, attempts")
    .lt("attempts", 10)
    .order("id")
    .limit(limit);
  if (error) throw new Error(`storage_queue_read_failed: ${error.message}`);

  let done = 0;
  let failed = 0;
  for (const row of (data ?? []) as DeletionRow[]) {
    try {
      const keys = row.is_prefix ? await listKeys(row.key_or_prefix) : [row.key_or_prefix];
      await deleteKeys(keys);
      await db.from("storage_deletions").delete().eq("id", row.id);
      done++;
    } catch (err) {
      console.error("storage_deletion_failed", row.id, (err as Error)?.message);
      await db.from("storage_deletions").update({ attempts: row.attempts + 1 }).eq("id", row.id);
      failed++;
    }
  }
  return { done, failed };
}
