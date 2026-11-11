/**
 * GET /boxes -> { boxes: [{ boxCode, name, type, destination, status, itemCount }] }
 */
import { withAuth } from "../lib/auth";
import { handleListBoxes } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleListBoxes, { methods: ["GET"], job: "required" });
