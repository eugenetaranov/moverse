/**
 * POST /account/provision { intent: 'personal'|'company', orgName? } (D4). Idempotent.
 */
import { withAuth } from "../../lib/auth";
import { handleProvision } from "../../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleProvision, { allowAnonymous: false });
