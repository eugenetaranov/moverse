/**
 * Job overview: progress, stage and next action derived from a job's raw
 * counts (job-overview-card change, design.md D1).
 *
 * The counts come from the `job_summary()` SQL function online, or from the
 * cached inventory offline. Everything here is pure and dependency-free.
 *
 * KEEP IN SYNC: mobile/src/jobSummary.ts is a byte-identical copy (the app
 * can't import from the repo root). lib/jobSummary.test.ts fails if they drift.
 */

export interface JobCounts {
  packing: number;
  sealed: number;
  loaded: number;
  delivered: number;
  boxes: number;
  items: number;
  photos: number;
  unboxed: number;
  undescribed: number;
}

export type JobStage =
  | "not_started"
  | "packing"
  | "loading"
  | "in_transit"
  | "delivering"
  | "delivered";

export type NextActionKind =
  | "add_first_item"
  | "boxes_open"
  | "unboxed_items"
  | "boxes_not_loaded"
  | "boxes_not_delivered";

export interface NextAction {
  kind: NextActionKind;
  count: number;
}

export interface JobSummary {
  counts: JobCounts;
  progress: number; // whole percent, 0-100
  stage: JobStage;
  nextAction: NextAction | null;
}

export const STAGE_LABELS: Record<JobStage, string> = {
  not_started: "Not started",
  packing: "Packing",
  loading: "Loading",
  in_transit: "In transit",
  delivering: "Delivering",
  delivered: "Delivered",
};

/**
 * Average lifecycle weight across boxes (packing 0, sealed 1/3, loaded 2/3,
 * delivered 1), floored to a whole percent. Computed in thirds so exact
 * results like 100% never suffer float error.
 */
export function progressOf(c: JobCounts): number {
  if (c.boxes === 0) return 0;
  const thirds = c.sealed + 2 * c.loaded + 3 * c.delivered;
  return Math.floor((thirds * 100) / (3 * c.boxes));
}

/** Stage rules, first match wins (spec: Derived job stage). */
export function stageOf(c: JobCounts): JobStage {
  if (c.boxes === 0 && c.items === 0) return "not_started";
  if (c.boxes > 0 && c.delivered === c.boxes) return "delivered";
  if (c.delivered > 0) return "delivering";
  if (c.packing > 0 || c.boxes === 0) return "packing";
  if (c.loaded === c.boxes) return "in_transit";
  return "loading";
}

export function nextActionOf(c: JobCounts, stage: JobStage): NextAction | null {
  const action = (kind: NextActionKind, count: number) =>
    count > 0 ? { kind, count } : null;
  switch (stage) {
    case "not_started":
      return { kind: "add_first_item", count: 0 };
    case "packing":
      return c.packing > 0
        ? action("boxes_open", c.packing)
        : action("unboxed_items", c.unboxed);
    case "loading":
      return action("boxes_not_loaded", c.sealed);
    case "delivering":
      return action("boxes_not_delivered", c.boxes - c.delivered);
    case "in_transit":
    case "delivered":
      return null;
  }
}

export function deriveSummary(counts: JobCounts): JobSummary {
  const stage = stageOf(counts);
  return {
    counts,
    progress: progressOf(counts),
    stage,
    nextAction: nextActionOf(counts, stage),
  };
}

export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** Client-side wording for a next action (the API only sends kind + count). */
export function nextActionText(a: NextAction): string {
  switch (a.kind) {
    case "add_first_item":
      return "Add your first item";
    case "boxes_open":
      return `${plural(a.count, "box", "boxes")} still open`;
    case "unboxed_items":
      return `${plural(a.count, "item", "items")} not in a box`;
    case "boxes_not_loaded":
      return `${plural(a.count, "sealed box", "sealed boxes")} not loaded`;
    case "boxes_not_delivered":
      return `${plural(a.count, "box", "boxes")} not delivered`;
  }
}
