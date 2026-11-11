/**
 * POST /invite-revoke { inviteId } -> { ok }.
 */
import { withAuth } from "../lib/auth";
import { handleInviteRevoke } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleInviteRevoke, { minRole: "admin" });
