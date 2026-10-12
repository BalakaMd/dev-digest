/**
 * Pure disagreement rows: one row per finding group, one cell per agent run.
 */
import type { Conflict, ConflictTake, FindingGroup, Severity } from '@devdigest/shared';
import { mostSevere } from './groups.js';

export interface ConflictColumn {
  run_id: string;
  agent_id: string | null;
  agent_name: string | null;
  status: 'running' | 'done' | 'failed' | 'cancelled';
  summary: string | null;
}

export interface ConflictFinding {
  id: string;
  severity: Severity;
  title: string;
}

function trimmedOrNull(s: string | null): string | null {
  const t = s?.trim();
  return t ? t : null;
}

export function buildConflicts(
  columns: readonly ConflictColumn[],
  groups: readonly FindingGroup[],
  findingsById: ReadonlyMap<string, ConflictFinding>,
): Conflict[] {
  return groups.map((group) => {
    const takes: ConflictTake[] = columns.map((col) => {
      const base = {
        run_id: col.run_id,
        agent_id: col.agent_id,
        agent_name: col.agent_name,
        severity: null,
        title: null,
        finding_id: null,
        more_count: 0,
        agent_summary: null,
      };
      // members are in the group's total order, so ties keep the first one.
      const own = group.members
        .filter((m) => m.run_id === col.run_id)
        .map((m) => findingsById.get(m.finding_id))
        .filter((f): f is ConflictFinding => f !== undefined);
      const top = mostSevere(own);
      if (top) {
        return {
          ...base,
          state: 'flagged' as const,
          severity: top.severity,
          title: top.title,
          finding_id: top.id,
          more_count: own.length - 1,
        };
      }
      if (col.status === 'done') {
        return { ...base, state: 'did_not_flag' as const, agent_summary: trimmedOrNull(col.summary) };
      }
      return { ...base, state: col.status };
    });

    const flagged = takes.filter((t) => t.state === 'flagged');
    const silent = takes.some((t) => t.state === 'did_not_flag');
    const severities = new Set(flagged.map((t) => t.severity));
    return {
      group_id: group.id,
      file: group.file,
      line: group.start_line,
      title: group.title,
      is_conflict: (flagged.length > 0 && silent) || severities.size > 1,
      takes,
    };
  });
}
