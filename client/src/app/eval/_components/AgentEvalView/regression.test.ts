import { describe, it, expect } from "vitest";
import type { EvalCompare, EvalSuiteRun } from "@devdigest/shared";
import { comparePair, completedRuns, detectDrops, passedToFailed, trendPoints } from "./regression";

const run = (id: string, over: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id,
  agent_id: "a1",
  agent_version: 1,
  status: "done",
  error: null,
  started_at: "2026-05-29T09:14:00Z",
  finished_at: null,
  cases_total: 10,
  cases_done: 10,
  cases_errored: 0,
  cases_passed: 8,
  recall: 0.8,
  precision: 0.9,
  citation_accuracy: 0.95,
  cost_usd: null,
  duration_ms: null,
  ...over,
});

describe("detectDrops (AC-42)", () => {
  it("reports each metric that fell by at least 1 pp, with the size of the drop", () => {
    const drops = detectDrops(
      run("n", { recall: 0.78, precision: 0.88, citation_accuracy: 0.95 }),
      run("p", { recall: 0.8, precision: 0.9, citation_accuracy: 0.95 }),
    );
    expect(drops.map((d) => d.metric)).toEqual(["recall", "precision"]);
    expect(drops[0]?.pp).toBeCloseTo(2);
  });

  it("treats exactly 1 pp as a drop despite floating point noise", () => {
    expect(detectDrops(run("n", { recall: 0.81 }), run("p", { recall: 0.82 })).map((d) => d.metric)).toEqual(["recall"]);
  });

  it("ignores drops below 1 pp, improvements and equal values", () => {
    expect(
      detectDrops(run("n", { recall: 0.815, precision: 0.95, citation_accuracy: 0.95 }), run("p", { recall: 0.82, precision: 0.9 })),
    ).toEqual([]);
  });

  it("never reports a metric without a value on either side (EC-16/19)", () => {
    expect(detectDrops(run("n", { recall: null }), run("p", { recall: 0.9 }))).toEqual([]);
    expect(detectDrops(run("n", { recall: 0.5 }), run("p", { recall: null }))).toEqual([]);
  });

  it("returns nothing with a single completed run", () => {
    expect(detectDrops(run("n"), null)).toEqual([]);
    expect(detectDrops(null, null)).toEqual([]);
  });
});

describe("completedRuns / trendPoints (AC-43, Q-6)", () => {
  const runs = [
    run("old", { started_at: "2026-05-19T10:00:00Z", agent_version: 3 }),
    run("fail", { status: "failed", started_at: "2026-05-28T10:00:00Z" }),
    run("new", { started_at: "2026-05-29T10:00:00Z", agent_version: 7 }),
    run("live", { status: "running", started_at: "2026-05-30T10:00:00Z", recall: null }),
  ];

  it("keeps only completed runs, newest first", () => {
    expect(completedRuns(runs).map((r) => r.id)).toEqual(["new", "old"]);
  });

  it("does not mutate its input", () => {
    const copy = [...runs];
    completedRuns(runs);
    expect(runs).toEqual(copy);
  });

  it("orders trend points chronologically and excludes failed and running runs", () => {
    expect(trendPoints(runs).map((p) => [p.runId, p.version])).toEqual([
      ["old", 3],
      ["new", 7],
    ]);
  });

  it("keeps a null metric as null instead of 0", () => {
    expect(trendPoints([run("x", { precision: null })])[0]?.precision).toBeNull();
  });
});

describe("passedToFailed", () => {
  const compare = {
    flipped: [
      { case_id: "1", case_name: "stripe-key", expectation_types: ["must_find"], from: "passed", to: "failed" },
      { case_id: "2", case_name: "fixed-one", expectation_types: ["must_find"], from: "failed", to: "passed" },
    ],
  } as unknown as EvalCompare;

  it("lists only the cases that regressed", () => {
    expect(passedToFailed(compare)).toEqual(["stripe-key"]);
  });
  it("is empty while the comparison is not loaded", () => {
    expect(passedToFailed(undefined)).toEqual([]);
  });
});

describe("comparePair (AC-30)", () => {
  const runs = [
    run("a", { started_at: "2026-05-01T00:00:00Z" }),
    run("b", { started_at: "2026-05-02T00:00:00Z" }),
    run("c", { started_at: "2026-05-03T00:00:00Z" }),
    run("f", { status: "failed", started_at: "2026-05-04T00:00:00Z" }),
  ];
  it("returns [older, newer] for exactly two completed runs, whatever the selection order", () => {
    expect(comparePair(["b", "a"], runs)?.map((r) => r.id)).toEqual(["a", "b"]);
  });
  it("is null for fewer or more than two", () => {
    expect(comparePair([], runs)).toBeNull();
    expect(comparePair(["a"], runs)).toBeNull();
    expect(comparePair(["a", "b", "c"], runs)).toBeNull();
  });
  it("is null when a selected run is not completed or unknown", () => {
    expect(comparePair(["a", "f"], runs)).toBeNull();
    expect(comparePair(["a", "zzz"], runs)).toBeNull();
  });
});
