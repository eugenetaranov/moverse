/**
 * Request pipeline for every API route (platform-foundation design.md D6):
 *
 *   1. method check
 *   2. verify the Supabase JWT locally (JWKS for asymmetric keys, or the
 *      legacy HS256 secret) — aud=authenticated, exp, iss
 *   3. user-scoped DB client, so every query runs as the caller under RLS
 *   4. optional job context from X-Moverse-Job (404 if not accessible, never
 *      403, so job ids can't be probed) and a minimum role
 *   5. run the handler; ApiErrors become { error: <code> } JSON
 *
 * Payloads (photos) are never logged.
 */
import { createRemoteJWKSet, decodeProtectedHeader, jwtVerify, type JWTPayload } from "jose";
import { env } from "./env";
import { ApiError, isUuid, json } from "./http";
import { rpc, userClient, type Db } from "./db";

export type Role = "owner" | "admin" | "crew";

const RANK: Record<Role, number> = { crew: 0, admin: 1, owner: 2 };

export interface JobCtx {
  id: string;
  orgId: string;
  orgKind: "company" | "personal";
  status: "active" | "archived";
}

export interface Ctx {
  userId: string;
  isAnonymous: boolean;
  email: string | null;
  claims: JWTPayload;
  jwt: string;
  db: Db;
  job?: JobCtx;
  role?: Role;
}

export interface AuthedCtx extends Ctx {
  job: JobCtx;
  role: Role;
}

export interface AuthOpts {
  methods?: string[];
  /** 'required' => 400 without the header, 404 without access. */
  job?: "required" | "optional";
  /** Minimum role in the job's org (requires a job). */
  minRole?: Role;
  /** Anonymous (crew) users are allowed unless false. */
  allowAnonymous?: boolean;
}

type Handler<C> = (req: Request, ctx: C) => Promise<Response>;

let jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
let jwksUrl = "";

/** Verify a Supabase access token. Throws ApiError(401) on any failure. */
export async function verifyJwt(token: string): Promise<JWTPayload> {
  const e = env();
  const opts = { audience: "authenticated", issuer: `${e.supabaseUrl}/auth/v1` };
  try {
    const { alg } = decodeProtectedHeader(token);
    if (alg === "HS256") {
      if (!e.supabaseJwtSecret) throw new Error("hs256_not_configured");
      const key = new TextEncoder().encode(e.supabaseJwtSecret);
      return (await jwtVerify(token, key, { ...opts, algorithms: ["HS256"] })).payload;
    }
    const url = `${e.supabaseUrl}/auth/v1/.well-known/jwks.json`;
    if (!jwks || jwksUrl !== url) {
      jwks = createRemoteJWKSet(new URL(url));
      jwksUrl = url;
    }
    return (await jwtVerify(token, jwks, { ...opts, algorithms: ["ES256", "RS256", "EdDSA"] }))
      .payload;
  } catch {
    throw new ApiError(401, "unauthenticated");
  }
}

function bearer(req: Request): string {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(\S+)$/i.exec(h);
  if (!m) throw new ApiError(401, "unauthenticated");
  return m[1];
}

interface JobContextRow {
  job_id: string;
  org_id: string;
  org_kind: "company" | "personal";
  job_status: "active" | "archived";
  role: Role;
}

export async function buildCtx(req: Request, opts: AuthOpts): Promise<Ctx> {
  const jwt = bearer(req);
  const claims = await verifyJwt(jwt);
  if (typeof claims.sub !== "string") throw new ApiError(401, "unauthenticated");
  const isAnonymous = claims.is_anonymous === true;
  if (isAnonymous && opts.allowAnonymous === false) {
    throw new ApiError(403, "anonymous_not_allowed");
  }

  const ctx: Ctx = {
    userId: claims.sub,
    isAnonymous,
    email: typeof claims.email === "string" && claims.email ? claims.email : null,
    claims,
    jwt,
    db: userClient(jwt),
  };

  const needJob = opts.job ?? (opts.minRole ? "required" : undefined);
  if (needJob) {
    const header = req.headers.get("x-moverse-job");
    if (!header) {
      if (needJob === "required") throw new ApiError(400, "missing_job");
    } else {
      if (!isUuid(header)) throw new ApiError(404, "job_not_found");
      const rows = await rpc<JobContextRow[]>(ctx.db, "job_context", { p_job: header });
      const row = rows?.[0];
      if (!row) throw new ApiError(404, "job_not_found");
      ctx.job = { id: row.job_id, orgId: row.org_id, orgKind: row.org_kind, status: row.job_status };
      ctx.role = row.role;
      if (opts.minRole && RANK[row.role] < RANK[opts.minRole]) {
        throw new ApiError(403, "forbidden");
      }
    }
  }
  return ctx;
}

export function errorResponse(err: unknown, route: string): Response {
  if (err instanceof ApiError) return json({ error: err.code, ...err.extra }, err.status);
  console.error("moverse_error", route, (err as Error)?.message);
  return json({ error: "internal_error" }, 500);
}

export function withAuth(handler: Handler<Ctx>, opts?: AuthOpts & { job?: "optional" }): (req: Request) => Promise<Response>;
export function withAuth(handler: Handler<AuthedCtx>, opts: AuthOpts & ({ job: "required" } | { minRole: Role })): (req: Request) => Promise<Response>;
export function withAuth(handler: Handler<any>, opts: AuthOpts = {}) {
  const methods = opts.methods ?? ["POST"];
  return async (req: Request): Promise<Response> => {
    if (!methods.includes(req.method)) return json({ error: "method_not_allowed" }, 405);
    try {
      const ctx = await buildCtx(req, opts);
      return await handler(req, ctx);
    } catch (err) {
      return errorResponse(err, new URL(req.url).pathname);
    }
  };
}
