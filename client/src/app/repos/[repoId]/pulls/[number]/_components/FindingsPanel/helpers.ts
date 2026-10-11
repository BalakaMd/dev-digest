import type { EvalCaseSummary, FindingRecord } from "@devdigest/shared";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, keep one severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severityFilter: string | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severityFilter) shown = shown.filter((f) => f.severity === severityFilter);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * Count findings per severity, ordered by SEVERITY_ORDER; severities with no
 * findings are omitted. A plain group-and-count over the findings the panel was
 * already handed — opening the page or flipping a filter never asks the API, let
 * alone a model, for these numbers.
 */
export function severityCounts(findings: FindingRecord[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return [...counts.entries()].sort(
    ([a], [b]) => (SEVERITY_ORDER[a] ?? 9) - (SEVERITY_ORDER[b] ?? 9),
  );
}

/**
 * Map finding id -> name of the eval case already made from it. Cases without a
 * source finding (hand-written ones) are skipped.
 */
export function evalCaseNameByFinding(
  cases: Pick<EvalCaseSummary, "source_finding_id" | "name">[] | undefined,
): Map<string, string> {
  const names = new Map<string, string>();
  for (const c of cases ?? []) {
    if (c.source_finding_id) names.set(c.source_finding_id, c.name);
  }
  return names;
}
