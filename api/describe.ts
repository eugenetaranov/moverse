/**
 * POST /describe { imageBase64 } -> { description }. 1.5 MB cap, daily org quota (D11).
 */
import { withAuth } from "../lib/auth";
import { handleDescribe } from "../lib/describe";

export const config = { runtime: "edge" };

export default withAuth(handleDescribe, { job: "required" });
