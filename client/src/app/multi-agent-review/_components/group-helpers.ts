import type { AgentColumn, FindingGroup, FindingRecord } from "@devdigest/shared";

/** Findings of every column, keyed by run id (derived, not stored). */
export function findingsByRun(columns: AgentColumn[]): Map<string, FindingRecord[]> {
  return new Map(columns.map((c) => [c.run_id, c.findings]));
}

/**
 * Names of the OTHER agents that flagged the same file/line range as
 * `findingId`, in group order. `unknownName` replaces a missing agent name.
 * Empty when the finding is in no group or alone in its group.
 */
export function alsoFlaggedBy(
  findingId: string,
  groups: FindingGroup[],
  columns: AgentColumn[],
  unknownName: string,
): string[] {
  const group = groups.find((g) => g.members.some((m) => m.finding_id === findingId));
  if (!group) return [];
  const own = group.members.find((m) => m.finding_id === findingId)!;
  const names: string[] = [];
  for (const m of group.members) {
    if (m.run_id === own.run_id) continue;
    const col = columns.find((c) => c.run_id === m.run_id);
    const name = col?.agent_name ?? unknownName;
    if (!names.includes(name)) names.push(name);
  }
  return names;
}
