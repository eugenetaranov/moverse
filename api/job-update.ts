/**
 * POST /job-update { name?, clientName?, status?, reportEnabled? } -> { job }. Rename, archive, unarchive.
 */
import { withAuth } from "../lib/auth";
import { handleJobUpdate } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleJobUpdate, { minRole: "admin" });
