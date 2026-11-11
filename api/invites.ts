/**
 * GET /invites -> { invites } (no tokens) | POST /invites { expiresInHours?, maxUses? } -> { token, url, ... } (D5).
 */
import { withAuth } from "../lib/auth";
import { handleInvites } from "../lib/accounts";

export const config = { runtime: "edge" };

export default withAuth(handleInvites, { methods: ["GET", "POST"], minRole: "admin" });
