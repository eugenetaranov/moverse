/**
 * POST /codes/reserve { kind: 'item'|'box', count <= 200 } -> { kind, first, last, format } (D12).
 */
import { withAuth } from "../../lib/auth";
import { handleReserve } from "../../lib/codes";

export const config = { runtime: "edge" };

export default withAuth(handleReserve, { job: "required" });
