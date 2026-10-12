import type { Conflict } from "@devdigest/shared";

/** Rows to show: every row, or only conflict rows when the switch is on (AC-46). */
export function visibleRows(conflicts: readonly Conflict[], onlyConflicts: boolean): Conflict[] {
  return onlyConflicts ? conflicts.filter((c) => c.is_conflict) : [...conflicts];
}

/** True while any agent run is still running (AC-48). */
export function hasRunning(conflicts: readonly Conflict[]): boolean {
  return conflicts.some((c) => c.takes.some((t) => t.state === "running"));
}
