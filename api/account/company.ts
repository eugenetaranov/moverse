/**
 * POST /account/company { name } -> { orgId }. "Start a company"; the personal org stays (D3).
 */
import { withAuth } from "../../lib/auth";
import { handleCreateCompany } from "../../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleCreateCompany, { allowAnonymous: false });
