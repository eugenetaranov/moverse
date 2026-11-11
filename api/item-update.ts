/**
 * POST /item-update { itemId, description?, boxCodes? } -> { ok }.
 */
import { withAuth } from "../lib/auth";
import { handleItemUpdate } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleItemUpdate, { job: "required" });
