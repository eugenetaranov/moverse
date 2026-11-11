// Server-reserved code pools (platform-foundation D12). Replaces the old
// single-device counters: each (user, job, kind) keeps a persisted list of
// ranges the server reserved for this device, so two phones on one job can
// never print the same code, and take() works offline while the pool lasts.
//
// Pure module (storage + reserve injected) so it's unit-testable in Node.

export type CodeKind = "item" | "box";

export interface PoolStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export interface PoolDeps {
  storage: PoolStorage;
  reserve: (kind: CodeKind, count: number) => Promise<{ first: number; last: number }>;
}

interface State {
  ranges: [number, number][]; // inclusive, ascending, unused
  lastIssued: number | null;
}

export const REFILL: Record<CodeKind, number> = { item: 50, box: 20 };
export const LOW_WATER = 10;

export function formatCode(kind: CodeKind, n: number): string {
  return kind === "box" ? `BOX-${String(n).padStart(2, "0")}` : `ITM-${String(n).padStart(4, "0")}`;
}

export function parseCode(kind: CodeKind, code: string): number | null {
  const m = (kind === "box" ? /^BOX-(\d+)$/ : /^ITM-(\d+)$/).exec(code.trim());
  return m ? parseInt(m[1], 10) : null;
}

export function remaining(s: State): number {
  return s.ranges.reduce((n, [a, b]) => n + (b - a + 1), 0);
}

export class CodePool {
  private refilling: Promise<void> | null = null;
  private queue: Promise<unknown> = Promise.resolve();

  constructor(
    readonly kind: CodeKind,
    private readonly key: string,
    private readonly deps: PoolDeps,
  ) {}

  private async load(): Promise<State> {
    try {
      const raw = await this.deps.storage.get(this.key);
      if (raw) return JSON.parse(raw) as State;
    } catch {
      // Corrupt entry: start empty; the server refills.
    }
    return { ranges: [], lastIssued: null };
  }

  private save(s: State): Promise<void> {
    return this.deps.storage.set(this.key, JSON.stringify(s));
  }

  /** Serialise state mutations (take/release/refill can interleave). */
  private locked<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn, fn);
    this.queue = run.catch(() => {});
    return run;
  }

  private refill(): Promise<void> {
    if (!this.refilling) {
      this.refilling = (async () => {
        const r = await this.deps.reserve(this.kind, REFILL[this.kind]);
        await this.locked(async () => {
          const s = await this.load();
          s.ranges.push([r.first, r.last]);
          s.ranges.sort((a, b) => a[0] - b[0]);
          await this.save(s);
        });
      })().finally(() => {
        this.refilling = null;
      });
    }
    return this.refilling;
  }

  /** Fill up ahead of need (online). Errors are swallowed: offline is fine. */
  async warm(): Promise<void> {
    if (remaining(await this.load()) < LOW_WATER) await this.refill().catch(() => {});
  }

  async size(): Promise<number> {
    return remaining(await this.load());
  }

  /**
   * Next code. Pops locally (works offline); when the pool runs low it refills
   * in the background. Throws only if the pool is empty AND the refill fails.
   */
  async take(): Promise<string> {
    if (remaining(await this.load()) === 0) await this.refill();
    const n = await this.locked(async () => {
      const s = await this.load();
      const first = s.ranges[0];
      if (!first) return null;
      const n = first[0];
      if (first[0] === first[1]) s.ranges.shift();
      else first[0] += 1;
      s.lastIssued = n;
      await this.save(s);
      return n;
    });
    if (n === null) return this.take();
    void this.warm();
    return formatCode(this.kind, n);
  }

  /**
   * Give back a code that was never saved. Only the most recently issued one
   * qualifies (an older one may already be on a printed label).
   */
  release(code: string): Promise<void> {
    return this.locked(async () => {
      const n = parseCode(this.kind, code);
      const s = await this.load();
      if (n === null || s.lastIssued !== n) return;
      const first = s.ranges[0];
      if (first && first[0] === n + 1) first[0] = n;
      else s.ranges.unshift([n, n]);
      s.lastIssued = null;
      await this.save(s);
    });
  }
}
