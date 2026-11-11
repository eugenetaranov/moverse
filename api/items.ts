/**
 * GET /items[?box=BOX-nn]
 *   -> { items: [{ itemId, itemCode, description, photoUrl, photoThumbUrl, photoUrls, boxCodes, destination }] }
 */
import { withAuth } from "../lib/auth";
import { handleListItems } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleListItems, { methods: ["GET"], job: "required" });
