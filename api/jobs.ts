/**
 * GET /jobs?orgId= -> { jobs } | POST /jobs { orgId, name, clientName? } -> { job } (owner/admin via RLS).
 */
import { withAuth } from "../lib/auth";
import { handleJobs } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleJobs, { methods: ["GET", "POST"] });
