// Service-role confinement (design.md D6, task 3.3): only the allow-listed
// entry points may import lib/privileged. Stands in for an ESLint
// no-restricted-imports rule without adding ESLint to the repo.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const ALLOWED = [/^api\/account\/delete\.ts$/, /^api\/cron\//, /^scripts\//];
const SCAN = ["api", "lib", "scripts", "web"];

function* files(dir: string): Generator<string> {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    if (e === "node_modules") continue;
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* files(p);
    else if (/\.(ts|tsx|js|mjs)$/.test(e)) yield p;
  }
}

test("lib/privileged is imported only from allow-listed modules", () => {
  const offenders: string[] = [];
  for (const top of SCAN) {
    for (const f of files(join(ROOT, top))) {
      const rel = relative(ROOT, f);
      if (rel === "lib/privileged.ts" || rel.endsWith(".test.ts")) continue;
      if (/from\s+["'][./]*(lib\/)?privileged["']/.test(readFileSync(f, "utf8")) && !ALLOWED.some((r) => r.test(rel))) {
        offenders.push(rel);
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test("the service role key is read nowhere else", () => {
  const offenders: string[] = [];
  for (const top of ["api", "lib"]) {
    for (const f of files(join(ROOT, top))) {
      const rel = relative(ROOT, f);
      if (rel === "lib/privileged.ts" || rel.endsWith(".test.ts")) continue;
      if (readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY")) offenders.push(rel);
    }
  }
  assert.deepEqual(offenders, []);
});
