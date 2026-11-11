/**
 * Code reservation (design.md D12). Each call advances the job's sequence
 * atomically, so two phones on one job always get disjoint ranges.
 */
import type { AuthedCtx } from "./auth";
import { rpc } from "./db";
import { ApiError, json, readJson } from "./http";

export interface Reservation {
  kind: "item" | "box";
  first: number;
  last: number;
  format: string;
}

export function formatCode(kind: "item" | "box", n: number): string {
  return kind === "box" ? `BOX-${String(n).padStart(2, "0")}` : `ITM-${String(n).padStart(4, "0")}`;
}

export function reserve(ctx: AuthedCtx, kind: "item" | "box", count: number): Promise<Reservation> {
  return rpc<Reservation>(ctx.db, "reserve_codes", { p_job: ctx.job.id, p_kind: kind, p_count: count });
}

/* ---------------- /codes/reserve ---------------- */

export async function handleReserve(req: Request, ctx: AuthedCtx): Promise<Response> {
  const { kind, count } = await readJson<{ kind?: string; count?: number }>(req);
  if (kind !== "item" && kind !== "box") throw new ApiError(400, "invalid_kind");
  if (!Number.isInteger(count)) throw new ApiError(400, "invalid_count");
  return json(await reserve(ctx, kind, count as number));
}

/* ---------------- /next-code, /next-box-code (compatibility) ---------------- */

export async function handleNextCode(_req: Request, ctx: AuthedCtx): Promise<Response> {
  const r = await reserve(ctx, "item", 1);
  return json({ nextCode: formatCode("item", r.first) });
}

export async function handleNextBoxCode(_req: Request, ctx: AuthedCtx): Promise<Response> {
  const r = await reserve(ctx, "box", 1);
  return json({ nextBoxCode: formatCode("box", r.first) });
}
