// Table-driven tests for deriveSummary (job-overview-card tasks 1.2/1.3).
// Runs the same fixtures against the API copy and the mobile copy so the
// online and offline summaries can't drift. Run with: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as lib from "./jobSummary.ts";
import * as mobile from "../mobile/src/jobSummary.ts";

interface Fixture {
  name: string;
  counts: lib.JobCounts;
  progress: number;
  stage: lib.JobStage;
  nextAction: string | null;
}

const fixtures: Fixture[] = JSON.parse(
  readFileSync(new URL("./jobSummary.fixtures.json", import.meta.url), "utf8"),
);

for (const [label, impl] of [["lib", lib], ["mobile", mobile]] as const) {
  for (const f of fixtures) {
    test(`${label}: ${f.name}`, () => {
      const s = impl.deriveSummary(f.counts);
      assert.equal(s.progress, f.progress, "progress");
      assert.equal(s.stage, f.stage, "stage");
      assert.equal(s.nextAction && impl.nextActionText(s.nextAction), f.nextAction, "next action");
      assert.deepEqual(s.counts, f.counts);
    });
  }
}

test("mobile copy is identical to lib/jobSummary.ts", () => {
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
  assert.equal(read("../mobile/src/jobSummary.ts"), read("./jobSummary.ts"));
});
