import { describe, it, expect } from 'vitest';
import { groupFindings, type GroupableFinding } from '../src/modules/reviews/multi-agent/groups.js';

/**
 * SPEC-08 T-1 — AC-42/43, NFR-2: findings of one multi-agent run group by file +
 * inclusive line-range overlap (transitive), deterministically, dropping nothing.
 */
const f = (o: Partial<GroupableFinding> & { id: string; start_line: number; end_line?: number }): GroupableFinding => ({
  run_id: 'run-a',
  file: 'src/a.ts',
  title: `title-${o.id}`,
  severity: 'WARNING',
  ...o,
  end_line: o.end_line ?? o.start_line,
});

describe('groupFindings', () => {
  it('overlap is inclusive: ranges that share a boundary line group together', () => {
    const groups = groupFindings([f({ id: 'a', start_line: 5, end_line: 10 }), f({ id: 'b', run_id: 'run-b', start_line: 10, end_line: 12 })]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members.map((m) => m.finding_id).sort()).toEqual(['a', 'b']);
    expect([groups[0]!.start_line, groups[0]!.end_line]).toEqual([5, 12]);
  });

  it('adjacent ranges (10 vs 11) stay in separate groups', () => {
    const groups = groupFindings([f({ id: 'a', start_line: 5, end_line: 10 }), f({ id: 'b', run_id: 'run-b', start_line: 11, end_line: 12 })]);
    expect(groups).toHaveLength(2);
  });

  it('is transitive: A~B and B~C put A, B and C in one group although A and C do not overlap', () => {
    const groups = groupFindings([
      f({ id: 'a', start_line: 1, end_line: 5 }),
      f({ id: 'b', run_id: 'run-b', start_line: 5, end_line: 9 }),
      f({ id: 'c', run_id: 'run-c', start_line: 9, end_line: 14 }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.members).toHaveLength(3);
    expect(groups[0]!.id).toBe('src/a.ts:1-14');
  });

  it('never groups findings of different files, even on the same lines', () => {
    const groups = groupFindings([f({ id: 'a', start_line: 3 }), f({ id: 'b', run_id: 'run-b', file: 'src/b.ts', start_line: 3 })]);
    expect(groups.map((g) => g.file)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('keeps every member of the group, including two findings of one agent (nothing dropped, AC-43)', () => {
    const input = [
      f({ id: 'a1', start_line: 4, end_line: 6 }),
      f({ id: 'a2', start_line: 5, end_line: 5, severity: 'CRITICAL' }),
      f({ id: 'b1', run_id: 'run-b', start_line: 6, end_line: 8, severity: 'SUGGESTION' }),
      f({ id: 'z', run_id: 'run-b', file: 'src/z.ts', start_line: 1 }),
    ];
    const groups = groupFindings(input);
    expect(groups.flatMap((g) => g.members.map((m) => m.finding_id)).sort()).toEqual(['a1', 'a2', 'b1', 'z']);
    const g = groups.find((x) => x.file === 'src/a.ts')!;
    expect(g.members).toContainEqual({ finding_id: 'a1', run_id: 'run-a' });
    expect(g.members).toContainEqual({ finding_id: 'b1', run_id: 'run-b' });
    // representative = most severe member
    expect([g.title, g.severity]).toEqual(['title-a2', 'CRITICAL']);
  });

  it('on a severity tie the representative is the first finding in the (file, start, end, id) order', () => {
    const groups = groupFindings([
      f({ id: 'late', start_line: 7, end_line: 9 }),
      f({ id: 'early', run_id: 'run-b', start_line: 5, end_line: 8 }),
    ]);
    expect(groups[0]!.title).toBe('title-early');
  });

  it('is deterministic: shuffled input gives identical groups, member order and ids (NFR-2)', () => {
    const input = [
      f({ id: 'a', start_line: 1, end_line: 3 }),
      f({ id: 'b', run_id: 'run-b', start_line: 3, end_line: 4 }),
      f({ id: 'c', run_id: 'run-c', start_line: 20 }),
      f({ id: 'd', file: 'src/0.ts', start_line: 2 }),
      f({ id: 'e', run_id: 'run-b', start_line: 3, end_line: 3 }),
    ];
    const expected = groupFindings(input);
    for (const shuffled of [[...input].reverse(), [input[2]!, input[4]!, input[0]!, input[3]!, input[1]!]]) {
      expect(groupFindings(shuffled)).toEqual(expected);
    }
  });

  it('returns no groups for no findings', () => {
    expect(groupFindings([])).toEqual([]);
  });
});
