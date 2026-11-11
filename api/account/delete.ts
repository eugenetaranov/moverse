/**
 * POST /account/delete { confirm: "DELETE" } -> { ok, deletedOrgs } (D14).
 *
 * 1. Sole owner of a company that still has members -> 409
 *    transfer_ownership_required with those orgs.
 * 2. Orgs the caller solely owns with nobody else are deleted (cascades
 *    inventory; R2 prefixes are queued for the storage cron).
 * 3. The auth user is deleted; memberships cascade, created_by goes null.
 */
import { withAuth } from "../../lib/auth";
import { rpc } from "../../lib/db";
import { ApiError, json, readJson } from "../../lib/http";
import { deleteAuthUser } from "../../lib/privileged";

export const config = { runtime: "edge" };

interface Plan {
  blocked: boolean;
  orgs: { id: string; name: string; kind: string; otherMembers: number }[];
}

export default withAuth(async (req, ctx) => {
  const { confirm } = await readJson<{ confirm?: string }>(req);
  if (confirm !== "DELETE") throw new ApiError(400, "confirm_required");

  const plan = await rpc<Plan>(ctx.db, "account_deletion_plan");
  if (plan.blocked) {
    throw new ApiError(409, "transfer_ownership_required", {
      orgs: plan.orgs.filter((o) => o.kind === "company" && o.otherMembers > 0),
    });
  }
  const deletedOrgs = await rpc<number>(ctx.db, "delete_owned_orgs");
  await deleteAuthUser(ctx.userId);
  return json({ ok: true, deletedOrgs });
});
