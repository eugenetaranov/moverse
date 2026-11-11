/**
 * POST /member-update { orgId, userId, action: set_role|remove|assign|unassign, role?, jobId? } -> { ok }.
 */
import { withAuth } from "../lib/auth";
import { handleMemberUpdate } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleMemberUpdate, {});
