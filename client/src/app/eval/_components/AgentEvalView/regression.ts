/* regression.ts — pure helpers of the agent dashboard view (SPEC-06 AC-27, 42, 43).
   Only completed runs count: failed and running runs never feed the latest/previous
   pair, the deltas, the trend or the regression banner (Q-6). No IO, no clock. */
import type { EvalCompare, EvalSuiteRun } from "@devdigest/shared";

export type EvalMetricKey = "recall" | "precision" | "citation_accuracy";

export const EVAL_METRICS: readonly EvalMetricKey[] = ["recall", "precision", "citation_accuracy"];

/** A drop of at least this many percentage points raises the banner (AC-42). */
export const REGRESSION_THRESHOLD_PP = 1;

/** Completed runs, newest first (stable on equal start times). */
export function completedRuns(runs: readonly EvalSuiteRun[]): EvalSuiteRun[] {
  return runs
    .filter((r) => r.status === "done")
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

export interface MetricDrop {
  metric: EvalMetricKey;
  /** Positive size of the drop in percentage points (e.g. 2 for 91% → 89%). */
  pp: number;
}

/**
 * Metrics of `latest` that fell by at least 1 pp against `previous`. A metric
 * without a value on either side is never reported (no value is not a drop);
 * no previous run → no drops (EC-19).
 */
export function detectDrops(latest: EvalSuiteRun | null, previous: EvalSuiteRun | null): MetricDrop[] {
  if (!latest || !previous) return [];
  const drops: MetricDrop[] = [];
  for (const metric of EVAL_METRICS) {
    const a = latest[metric];
    const b = previous[metric];
    if (a == null || b == null) continue;
    const pp = (b - a) * 100;
    // 1e-9 absorbs floating point noise: 0.82 - 0.81 must count as exactly 1 pp.
    if (pp >= REGRESSION_THRESHOLD_PP - 1e-9) drops.push({ metric, pp });
  }
  return drops;
}

/** Names of the cases that went from passed to failed between the two compared runs. */
export function passedToFailed(compare: EvalCompare | undefined | null): string[] {
  if (!compare) return [];
  return compare.flipped.filter((f) => f.from === "passed" && f.to === "failed").map((f) => f.case_name);
}

export interface TrendPoint {
  runId: string;
  /** "2026-05-29 09:14" style label is the caller's job; this is the ISO start time. */
  startedAt: string;
  version: number;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

/** Completed runs in chronological order (oldest first), one point per run. */
export function trendPoints(runs: readonly EvalSuiteRun[]): TrendPoint[] {
  return completedRuns(runs)
    .reverse()
    .map((r) => ({
      runId: r.id,
      startedAt: r.started_at,
      version: r.agent_version,
      recall: r.recall,
      precision: r.precision,
      citation_accuracy: r.citation_accuracy,
    }));
}

/** The two selected run ids ordered [older, newer] by start time; null unless exactly two (AC-30). */
export function comparePair(
  selected: readonly string[],
  runs: readonly EvalSuiteRun[],
): [older: EvalSuiteRun, newer: EvalSuiteRun] | null {
  if (selected.length !== 2) return null;
  const a = runs.find((r) => r.id === selected[0]);
  const b = runs.find((r) => r.id === selected[1]);
  if (!a || !b || a.status !== "done" || b.status !== "done") return null;
  return a.started_at <= b.started_at ? [a, b] : [b, a];
}
