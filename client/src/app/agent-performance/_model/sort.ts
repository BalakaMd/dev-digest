/* Table sort rules (AC-33, AC-34, AC-52). Pure; returns a new array. */
import type { AgentPerformanceRow } from "@devdigest/shared";
import { DEFAULT_DIR, MIN_DECISIONS, type SortColumn, type SortDir } from "./constants";

function compareText(a: string, b: string): number {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x < y ? -1 : x > y ? 1 : 0;
}

function byName(a: AgentPerformanceRow, b: AgentPerformanceRow): number {
  return compareText(a.name, b.name) || compareText(a.agent_id, b.agent_id);
}

/** Accept groups: 0 = ≥10 decisions, 1 = low sample, 2 = no rate. Same order in both directions. */
function acceptGroup(row: AgentPerformanceRow): number {
  if (row.accept.rate == null) return 2;
  return row.accept.decisions >= MIN_DECISIONS ? 0 : 1;
}

function numericValue(row: AgentPerformanceRow, column: Exclude<SortColumn, "accept">): number | null {
  switch (column) {
    case "runs":
      return row.runs;
    case "avg_cost":
      return row.avg_cost_usd;
    case "avg_duration":
      return row.avg_duration_ms;
    case "last_run":
      return row.last_run_at == null ? null : Date.parse(row.last_run_at);
  }
}

export function sortRows(
  rows: readonly AgentPerformanceRow[],
  column: SortColumn,
  dir: SortDir,
): AgentPerformanceRow[] {
  const sign = dir === "asc" ? 1 : -1;
  return [...rows].sort((a, b) => {
    if (column === "accept") {
      const g = acceptGroup(a) - acceptGroup(b);
      if (g !== 0) return g;
      const diff = (a.accept.rate ?? 0) - (b.accept.rate ?? 0);
      return diff !== 0 ? sign * diff : byName(a, b);
    }
    const va = numericValue(a, column);
    const vb = numericValue(b, column);
    if (va == null && vb == null) return byName(a, b);
    if (va == null) return 1; // no value → last in both directions
    if (vb == null) return -1;
    return va !== vb ? sign * (va - vb) : byName(a, b);
  });
}

/** Header activation: same column toggles the direction, another column starts descending. */
export function nextSort(
  current: { column: SortColumn; dir: SortDir },
  column: SortColumn,
): { column: SortColumn; dir: SortDir } {
  if (current.column !== column) return { column, dir: DEFAULT_DIR };
  return { column, dir: current.dir === "desc" ? "asc" : "desc" };
}
