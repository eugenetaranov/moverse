/**
 * POST /box-update { boxCode, name?, type?, destination?, status? } -> { ok }.
 */
import { withAuth } from "../lib/auth";
import { handleBoxUpdate } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleBoxUpdate, { job: "required" });
