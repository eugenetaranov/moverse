/**
 * POST /box-delete { boxCode } -> { ok, deleted }. Items stay, losing the link. Owner/admin.
 */
import { withAuth } from "../lib/auth";
import { handleBoxDelete } from "../lib/inventory";

export const config = { runtime: "edge" };

export default withAuth(handleBoxDelete, { minRole: "admin" });
