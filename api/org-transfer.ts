/**
 * POST /org-transfer { orgId, userId } -> { ok }. Owner only.
 */
import { withAuth } from "../lib/auth";
import { handleOrgTransfer } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleOrgTransfer, {});
