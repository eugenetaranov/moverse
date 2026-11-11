/**
 * GET /report-token -> { token } | POST regenerates it (revokes the old report link).
 */
import { withAuth } from "../lib/auth";
import { handleReportToken } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleReportToken, { methods: ["GET", "POST"], minRole: "admin" });
