/**
 * GET /me -> { user, orgs, jobs, defaults }. Bootstrap after sign-in; self-heals a missing personal workspace (D4).
 */
import { withAuth } from "../lib/auth";
import { handleMe } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleMe, { methods: ["GET"] });
