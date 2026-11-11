/**
 * POST /item-delete { itemId } | { itemIds } -> { ok, deleted }. Owner/admin.
 */
import { withAuth } from "../lib/auth";
import { handleItemDelete } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleItemDelete, { minRole: "admin" });
