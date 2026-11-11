/**
 * POST /org-leave { orgId } -> { ok }. Owners must transfer first.
 */
import { withAuth } from "../lib/auth";
import { handleLeaveOrg } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleLeaveOrg, {});
