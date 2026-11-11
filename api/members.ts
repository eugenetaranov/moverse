/**
 * GET /members?orgId= -> { members } with job assignments (owner/admin, enforced in list_members).
 */
import { withAuth } from "../lib/auth";
import { handleMembers } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleMembers, { methods: ["GET"] });
