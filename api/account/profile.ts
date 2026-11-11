/**
 * POST /account/profile { displayName } -> { ok }.
 */
import { withAuth } from "../../lib/auth";
import { handleProfile } from "../../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleProfile, {});
