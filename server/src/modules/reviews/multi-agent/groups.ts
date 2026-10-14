/**
 * Pure grouping of findings by file + overlapping line range (union-find).
 * No IO, no external calls: overlap is purely positional, so the
 * output depends only on the stored findings (total ordering => deterministic).
 */
import type { FindingGroup, Severity } from '@devdigest/shared';

export interface GroupableFinding {
  id: string;
  run_id: string;
  file: string;
  start_line: number;
  end_line: number;
  title: string;
  severity: Severity;
}

export const SEVERITY_RANK: Record<Severity, number> = { CRITICAL: 3, WARNING: 2, SUGGESTION: 1 };

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Total order used everywhere: (file, start_line, end_line, id). */
export function compareFindings(
  a: { file: string; start_line: number; end_line: number; id: string },
  b: { file: string; start_line: number; end_line: number; id: string },
): number {
  return cmp(a.file, b.file) || a.start_line - b.start_line || a.end_line - b.end_line || cmp(a.id, b.id);
}

/** Most severe finding; ties resolve to the first one in the given order. */
export function mostSevere<T extends { severity: Severity }>(items: readonly T[]): T | undefined {
  let best: T | undefined;
  for (const it of items) {
    if (!best || SEVERITY_RANK[it.severity] > SEVERITY_RANK[best.severity]) best = it;
  }
  return best;
}

export function groupFindings(findings: readonly GroupableFinding[]): FindingGroup[] {
  const sorted = [...findings].sort(compareFindings);
  const parent = sorted.map((_, i) => i);
  const find = (i: number): number => {
    let r = i;
    while (parent[r] !== r) r = parent[r]!;
    while (parent[i] !== r) {
      const next = parent[i]!;
      parent[i] = r;
      i = next;
    }
    return r;
  };
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length; j++) {
      const a = sorted[i]!;
      const b = sorted[j]!;
      if (b.file !== a.file) break; // sorted by file first
      if (a.start_line <= b.end_line && b.start_line <= a.end_line) {
        parent[find(j)] = find(i);
      }
    }
  }

  const buckets = new Map<number, GroupableFinding[]>();
  sorted.forEach((f, i) => {
    const root = find(i);
    const list = buckets.get(root);
    if (list) list.push(f);
    else buckets.set(root, [f]);
  });

  const groups: FindingGroup[] = [];
  for (const members of buckets.values()) {
    const rep = mostSevere(members)!;
    const first = members[0]!;
    const start = Math.min(...members.map((m) => m.start_line));
    const end = Math.max(...members.map((m) => m.end_line));
    groups.push({
      id: `${first.file}:${start}-${end}`,
      file: first.file,
      start_line: start,
      end_line: end,
      title: rep.title,
      severity: rep.severity,
      members: members.map((m) => ({ finding_id: m.id, run_id: m.run_id })),
    });
  }
  return groups.sort(
    (a, b) => cmp(a.file, b.file) || a.start_line - b.start_line || a.end_line - b.end_line,
  );
}
