/**
 * POST /next-code -> { nextCode }. Compatibility: reserves one item code (D12).
 */
import { withAuth } from "../lib/auth";
import { handleNextCode } from "../lib/codes";

export const config = { runtime: "edge" };

export default withAuth(handleNextCode, { job: "required" });
