/**
 * POST /save { itemId, itemCode?, boxCode?, newBox?, description?, photoIds? }
 *   -> { ok, itemId, itemCode, boxCode, action: created|added|exists } (D9).
 */
import { withAuth } from "../lib/auth";
import { handleSave } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleSave, { job: "required" });
