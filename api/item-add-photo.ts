/**
 * POST /item-add-photo { itemId, photoIds } -> { ok }. Photos uploaded via /photos/upload-url first.
 */
import { withAuth } from "../lib/auth";
import { handleItemAddPhoto } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleItemAddPhoto, { job: "required" });
