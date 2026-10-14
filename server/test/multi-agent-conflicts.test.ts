import { describe, it, expect } from 'vitest';
import type { FindingGroup, Severity } from '@devdigest/shared';
import {
  buildConflicts,
  type ConflictColumn,
  type ConflictFinding,
} from '../src/modules/reviews/multi-agent/conflicts.js';

/**
 * SPEC-08 T-2 — AC-45/46/47/48: one disagreement row per finding group, one cell per
 * agent run; `is_conflict` ignores running/failed/cancelled cells.
 */
const col = (id: string, status: ConflictColumn['status'], summary: string | null = null): ConflictColumn => ({
  run_id: id,
  agent_id: `agent-${id}`,
  agent_name: `Agent ${id}`,
  status,
  summary,
});
const fnd = (id: string, severity: Severity, title = `T-${id}`): [string, ConflictFinding] => [id, { id, severity, title }];

function group(members: { finding_id: string; run_id: string }[], title = 'Group title'): FindingGroup {
  return { id: 'src/a.ts:5-9', file: 'src/a.ts', start_line: 5, end_line: 9, title, severity: 'WARNING', members };
}
const run = (columns: ConflictColumn[], g: FindingGroup, findings: [string, ConflictFinding][]) =>
  buildConflicts(columns, [g], new Map(findings))[0]!;

describe('buildConflicts', () => {
  it('one row per group with file, start line and group title; a take per column in column order', () => {
    const row = run(
      [col('a', 'done'), col('b', 'done')],
      group([{ finding_id: 'f1', run_id: 'a' }]),
      [fnd('f1', 'WARNING')],
    );
    expect(row).toMatchObject({ group_id: 'src/a.ts:5-9', file: 'src/a.ts', line: 5, title: 'Group title' });
    expect(row.takes.map((t) => t.run_id)).toEqual(['a', 'b']);
  });

  it('flagged cell shows the most severe finding and "+N more" for the others (ties keep the first member)', () => {
    const row = run(
      [col('a', 'done')],
      group([
        { finding_id: 'f1', run_id: 'a' },
        { finding_id: 'f2', run_id: 'a' },
        { finding_id: 'f3', run_id: 'a' },
      ]),
      [fnd('f1', 'WARNING'), fnd('f2', 'CRITICAL'), fnd('f3', 'CRITICAL')],
    );
    expect(row.takes[0]).toMatchObject({ state: 'flagged', finding_id: 'f2', severity: 'CRITICAL', title: 'T-f2', more_count: 2 });
  });

  it('a done agent without a finding "did not flag" and carries its trimmed summary; empty summary -> null', () => {
    const g = group([{ finding_id: 'f1', run_id: 'a' }]);
    const row = run([col('a', 'done'), col('b', 'done', '  Looks fine overall.  '), col('c', 'done', '   ')], g, [fnd('f1', 'WARNING')]);
    expect(row.takes[1]).toMatchObject({ state: 'did_not_flag', agent_summary: 'Looks fine overall.', finding_id: null });
    expect(row.takes[2]).toMatchObject({ state: 'did_not_flag', agent_summary: null });
  });

  it('running, failed and cancelled runs without a finding show their status, never "did not flag"', () => {
    const row = run(
      [col('a', 'done'), col('r', 'running'), col('f', 'failed'), col('c', 'cancelled')],
      group([{ finding_id: 'f1', run_id: 'a' }]),
      [fnd('f1', 'WARNING')],
    );
    expect(row.takes.map((t) => t.state)).toEqual(['flagged', 'running', 'failed', 'cancelled']);
  });

  describe('is_conflict', () => {
    const g = (runs: string[]) => group(runs.map((r) => ({ finding_id: `f-${r}`, run_id: r })));

    it('true when an agent flagged and a done agent did not', () => {
      expect(run([col('a', 'done'), col('b', 'done')], g(['a']), [fnd('f-a', 'WARNING')]).is_conflict).toBe(true);
    });

    it('true when the flagging agents gave different severities', () => {
      const row = run([col('a', 'done'), col('b', 'done')], g(['a', 'b']), [fnd('f-a', 'WARNING'), fnd('f-b', 'CRITICAL')]);
      expect(row.is_conflict).toBe(true);
    });

    it('false when every agent flagged with the same severity', () => {
      const row = run([col('a', 'done'), col('b', 'done')], g(['a', 'b']), [fnd('f-a', 'WARNING', 'x'), fnd('f-b', 'WARNING', 'y')]);
      expect(row.is_conflict).toBe(false);
    });

    it('failed, cancelled and running cells are ignored: one flagger + only non-done others is no conflict', () => {
      const row = run(
        [col('a', 'done'), col('f', 'failed'), col('c', 'cancelled'), col('r', 'running')],
        g(['a']),
        [fnd('f-a', 'WARNING')],
      );
      expect(row.is_conflict).toBe(false);
    });
  });

  it('a run where every agent failed produces no rows when there are no groups', () => {
    expect(buildConflicts([col('a', 'failed'), col('b', 'failed')], [], new Map())).toEqual([]);
  });
});
