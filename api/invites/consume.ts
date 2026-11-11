/**
 * POST /invites/consume { token | url, displayName? } -> { orgId, jobId }. Anonymous crew allowed (D5).
 */
import { withAuth } from "../../lib/auth";
import { handleConsume } from "../../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleConsume, {});
