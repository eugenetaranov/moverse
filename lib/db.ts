/**
 * User-scoped Postgres access (design.md D6 step 3). Every query runs as the
 * caller under RLS; the service role lives only in lib/privileged.ts.
 *
 * RPCs raise stable snake_case messages (see 0004_rpcs.sql); rpc() maps them
 * to ApiErrors with the right HTTP status.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "./env";
import { ApiError } from "./http";

export type Db = SupabaseClient;

export function userClient(jwt: string): Db {
  const e = env();
  return createClient(e.supabaseUrl, e.supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

// RPC error message -> HTTP status. Unknown P0001 messages are client errors.
const STATUS: Record<string, number> = {
  unauthenticated: 401,
  forbidden: 403,
  anonymous_not_allowed: 403,
  personal_org_cannot_invite: 403,
  anonymous_cannot_be_admin: 403,
  anonymous_cannot_be_owner: 403,
  job_not_found: 404,
  item_not_found: 404,
  member_not_found: 404,
  invite_not_found: 404,
  photo_not_found: 404,
  invite_invalid: 404,
  invite_expired: 410,
  invite_used_up: 410,
  transfer_ownership_required: 409,
  use_transfer_ownership: 409,
  use_leave_org: 409,
  item_conflict: 409,
  photo_conflict: 409,
};

interface PgError {
  code?: string;
  message?: string;
}

export function dbError(err: PgError): ApiError {
  if (err.code === "P0001" && err.message) {
    return new ApiError(STATUS[err.message] ?? 400, err.message);
  }
  if (err.code === "42501") return new ApiError(403, "forbidden");
  if (err.code === "23503" || err.code === "23505") return new ApiError(409, "conflict");
  if (err.code === "22P02" || err.code === "23514") return new ApiError(400, "invalid_input");
  console.error("db_error", err.code, err.message);
  return new ApiError(500, "internal_error");
}

export async function rpc<T>(db: Db, fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const { data, error } = await db.rpc(fn, args);
  if (error) throw dbError(error);
  return data as T;
}

/** Unwrap a supabase-js query result, mapping errors like rpc(). */
export function must<T>(res: { data: T | null; error: PgError | null }): T {
  if (res.error) throw dbError(res.error);
  return res.data as T;
}
