/**
 * POST /next-box-code -> { nextBoxCode }. Compatibility: reserves one box code (D12).
 */
import { withAuth } from "../lib/auth";
import { handleNextBoxCode } from "../lib/codes";

export const config = { runtime: "edge" };

export default withAuth(handleNextBoxCode, { job: "required" });
