/**
 * Accounts, jobs, invites and members (design.md D3/D4/D5/D13). Every rule in
 * the permission matrix is enforced by the SECURITY DEFINER RPCs and RLS; the
 * handlers only validate input and shape responses.
 */
import type { AuthedCtx, Ctx } from "./auth";
import { must, rpc } from "./db";
import { env } from "./env";
import { ApiError, json, readJson, requireUuid } from "./http";

/* ---------------- /me ---------------- */

interface MeOrg {
  id: string;
  name: string;
  kind: "company" | "personal";
  role: "owner" | "admin" | "crew";
  plan: string;
}
interface MeJob {
  id: string;
  orgId: string;
  name: string;
  clientName: string | null;
  status: "active" | "archived";
}

/** Prefer an active company job, then any active job, then the first org. */
export function pickDefaults(orgs: MeOrg[], jobs: MeJob[]): { orgId: string | null; jobId: string | null } {
  const active = jobs.filter((j) => j.status === "active");
  const kindOf = new Map(orgs.map((o) => [o.id, o.kind]));
  const job = active.find((j) => kindOf.get(j.orgId) === "company") ?? active[0] ?? null;
  return { orgId: job?.orgId ?? orgs[0]?.id ?? null, jobId: job?.id ?? null };
}

export async function handleMe(_req: Request, ctx: Ctx): Promise<Response> {
  let me = await rpc<{ orgs: MeOrg[]; jobs: MeJob[] }>(ctx.db, "me");
  // Self-heal: a non-anonymous user with no memberships (app killed between
  // sign-up and provision) gets a personal workspace (D4 step 3).
  if (me.orgs.length === 0 && !ctx.isAnonymous) {
    await rpc(ctx.db, "provision_account", { p_intent: "personal" });
    me = await rpc(ctx.db, "me");
  }
  const meta = (ctx.claims.user_metadata ?? {}) as { display_name?: string };
  return json({
    user: {
      id: ctx.userId,
      email: ctx.email,
      isAnonymous: ctx.isAnonymous,
      displayName: meta.display_name ?? "",
    },
    orgs: me.orgs,
    jobs: me.jobs,
    defaults: pickDefaults(me.orgs, me.jobs),
  });
}

/* ---------------- /account/provision, /account/profile ---------------- */

export async function handleProvision(req: Request, ctx: Ctx): Promise<Response> {
  const { intent, orgName } = await readJson<{ intent?: string; orgName?: string }>(req);
  if (intent !== "personal" && intent !== "company") throw new ApiError(400, "invalid_intent");
  const result = await rpc<Record<string, unknown>>(ctx.db, "provision_account", {
    p_intent: intent,
    p_org_name: orgName ?? null,
  });
  return json(result);
}

export async function handleProfile(req: Request, ctx: Ctx): Promise<Response> {
  const { displayName } = await readJson<{ displayName?: string }>(req);
  await rpc(ctx.db, "set_display_name", { p_name: displayName ?? "" });
  return json({ ok: true });
}

/** POST /account/company { name } — "Start a company" (personal org stays). */
export async function handleCreateCompany(req: Request, ctx: Ctx): Promise<Response> {
  const { name } = await readJson<{ name?: string }>(req);
  const orgId = await rpc<string>(ctx.db, "create_company", { p_name: name ?? "" });
  return json({ orgId });
}

/* ---------------- /jobs, /job-update ---------------- */

const JOB_COLS = "id, orgId:org_id, name, clientName:client_name, status, reportEnabled:report_enabled, createdAt:created_at";

export async function handleJobs(req: Request, ctx: Ctx): Promise<Response> {
  if (req.method === "GET") {
    const orgId = requireUuid(new URL(req.url).searchParams.get("orgId"), "missing_org");
    const jobs = must(
      await ctx.db.from("jobs").select(JOB_COLS).eq("org_id", orgId).order("status").order("created_at", { ascending: false }),
    );
    return json({ jobs });
  }
  const { orgId, name, clientName } = await readJson<{ orgId?: string; name?: string; clientName?: string }>(req);
  requireUuid(orgId, "missing_org");
  if (!name || !name.trim()) throw new ApiError(400, "missing_name");
  const res = await ctx.db
    .from("jobs")
    .insert({ org_id: orgId, name: name.trim(), client_name: clientName?.trim() || null })
    .select(JOB_COLS)
    .single();
  // RLS refuses a non-admin insert with 42501 -> 403.
  return json({ job: must(res) }, 201);
}

export async function handleJobUpdate(req: Request, ctx: AuthedCtx): Promise<Response> {
  const body = await readJson<{ name?: string; clientName?: string | null; status?: string; reportEnabled?: boolean }>(req);
  const patch: Record<string, unknown> = {};
  if (typeof body.name === "string") {
    if (!body.name.trim()) throw new ApiError(400, "missing_name");
    patch.name = body.name.trim();
  }
  if (body.clientName !== undefined) patch.client_name = body.clientName?.trim() || null;
  if (body.status !== undefined) {
    if (body.status !== "active" && body.status !== "archived") throw new ApiError(400, "invalid_status");
    patch.status = body.status;
  }
  if (typeof body.reportEnabled === "boolean") patch.report_enabled = body.reportEnabled;
  if (Object.keys(patch).length === 0) throw new ApiError(400, "nothing_to_update");
  const job = must(await ctx.db.from("jobs").update(patch).eq("id", ctx.job.id).select(JOB_COLS).single());
  return json({ job });
}

/* ---------------- /invites, /invite-revoke, /invites/consume ---------------- */

export function inviteUrl(token: string): string {
  return `${env().inviteBaseUrl}/j/${token}`;
}

export async function handleInvites(req: Request, ctx: AuthedCtx): Promise<Response> {
  if (req.method === "GET") {
    const invites = must(
      await ctx.db
        .from("invites")
        .select("id, role, expiresAt:expires_at, maxUses:max_uses, uses, createdAt:created_at")
        .eq("job_id", ctx.job.id)
        .is("revoked_at", null)
        .gt("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false }),
    );
    return json({ invites });
  }
  const { expiresInHours, maxUses } = await readJson<{ expiresInHours?: number; maxUses?: number }>(req);
  const inv = await rpc<{ inviteId: string; token: string; expiresAt: string; maxUses: number }>(
    ctx.db,
    "create_invite",
    { p_job: ctx.job.id, p_expires_hours: expiresInHours ?? 168, p_max_uses: maxUses ?? 20 },
  );
  // The token is returned exactly once; only its hash is stored.
  return json({ ...inv, url: inviteUrl(inv.token) }, 201);
}

export async function handleInviteRevoke(req: Request, ctx: AuthedCtx): Promise<Response> {
  const { inviteId } = await readJson<{ inviteId?: string }>(req);
  await rpc(ctx.db, "revoke_invite", { p_invite: requireUuid(inviteId, "missing_invite") });
  return json({ ok: true });
}

/** Accepts a raw token or a full invite URL (from the QR code). */
export function tokenFromInput(input: string): string {
  const m = /\/j\/([A-Za-z0-9_-]+)\/?$/.exec(input.trim());
  return m ? m[1] : input.trim();
}

export async function handleConsume(req: Request, ctx: Ctx): Promise<Response> {
  const { token, displayName } = await readJson<{ token?: string; displayName?: string }>(req);
  if (!token) throw new ApiError(400, "missing_token");
  if (displayName && displayName.trim()) {
    await rpc(ctx.db, "set_display_name", { p_name: displayName });
  }
  const result = await rpc<{ orgId: string; jobId: string }>(ctx.db, "consume_invite", {
    p_token: tokenFromInput(token),
  });
  return json(result);
}

/* ---------------- /members, /member-update, /org-transfer ---------------- */

export async function handleMembers(req: Request, ctx: Ctx): Promise<Response> {
  const orgId = requireUuid(new URL(req.url).searchParams.get("orgId"), "missing_org");
  const members = await rpc<unknown[]>(ctx.db, "list_members", { p_org: orgId });
  return json({ members });
}

export async function handleMemberUpdate(req: Request, ctx: Ctx): Promise<Response> {
  const body = await readJson<{ orgId?: string; userId?: string; action?: string; role?: string; jobId?: string }>(req);
  const orgId = requireUuid(body.orgId, "missing_org");
  const userId = requireUuid(body.userId, "missing_user");
  switch (body.action) {
    case "set_role":
      if (body.role !== "admin" && body.role !== "crew") throw new ApiError(400, "invalid_role");
      await rpc(ctx.db, "set_member_role", { p_org: orgId, p_user: userId, p_role: body.role });
      break;
    case "remove":
      await rpc(ctx.db, "remove_member", { p_org: orgId, p_user: userId });
      break;
    case "assign":
    case "unassign":
      await rpc(ctx.db, "assign_job", {
        p_job: requireUuid(body.jobId, "missing_job"),
        p_user: userId,
        p_assign: body.action === "assign",
      });
      break;
    default:
      throw new ApiError(400, "invalid_action");
  }
  return json({ ok: true });
}

export async function handleOrgTransfer(req: Request, ctx: Ctx): Promise<Response> {
  const body = await readJson<{ orgId?: string; userId?: string }>(req);
  await rpc(ctx.db, "transfer_ownership", {
    p_org: requireUuid(body.orgId, "missing_org"),
    p_user: requireUuid(body.userId, "missing_user"),
  });
  return json({ ok: true });
}

export async function handleLeaveOrg(req: Request, ctx: Ctx): Promise<Response> {
  const { orgId } = await readJson<{ orgId?: string }>(req);
  await rpc(ctx.db, "leave_org", { p_org: requireUuid(orgId, "missing_org") });
  return json({ ok: true });
}

/* ---------------- /report-token ---------------- */

/** GET reads, POST regenerates the job's client report token (owner/admin). */
export async function handleReportToken(req: Request, ctx: AuthedCtx): Promise<Response> {
  const fn = req.method === "GET" ? "get_report_token" : "regenerate_report_token";
  const token = await rpc<string>(ctx.db, fn, { p_job: ctx.job.id });
  return json({ token });
}
