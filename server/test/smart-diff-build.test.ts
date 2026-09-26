/**
 * Unit coverage for the pure Smart Diff grouping (`build.ts`): `buildSmartDiff`
 * (D3: fixed group order, files sorted by path, finding_lines uniqueness) and
 * `selectLatestReviews` (D2: newest review per agent, `summary` rows excluded).
 */
import { describe, it, expect } from 'vitest';
import { SmartDiff } from '@devdigest/shared';
import {
  buildSmartDiff,
  selectLatestReviews,
  SMART_DIFF_ROLE_ORDER,
} from '../src/modules/reviews/smart-diff/index.js';

describe('buildSmartDiff', () => {
  const files = [
    { path: 'pnpm-lock.yaml', additions: 5, deletions: 2 }, // boilerplate
    { path: 'src/b.ts', additions: 3, deletions: 1 }, // core
    { path: 'src/a.ts', additions: 2, deletions: 0 }, // core
    { path: 'src/a.test.ts', additions: 1, deletions: 1 }, // tests
  ];
  const findings = [
    { file: 'src/a.ts', start_line: 20 },
    { file: 'src/a.ts', start_line: 10 },
    { file: 'src/a.ts', start_line: 10 }, // duplicate — must collapse
    { file: 'src/b.ts', start_line: 5 },
  ];
  const result = buildSmartDiff(files, findings);

  it('returns all five groups in the fixed display order, including empty ones', () => {
    expect(result.groups.map((g) => g.role)).toEqual([...SMART_DIFF_ROLE_ORDER]);
    const wiring = result.groups.find((g) => g.role === 'wiring')!;
    const docs = result.groups.find((g) => g.role === 'docs')!;
    expect(wiring.files).toEqual([]);
    expect(docs.files).toEqual([]);
  });

  it('sorts files by path within a group', () => {
    const core = result.groups.find((g) => g.role === 'core')!;
    expect(core.files.map((f) => f.path)).toEqual(['src/a.ts', 'src/b.ts']);
  });

  it('attaches unique, ascending finding_lines from start_line only, matched by file path', () => {
    const core = result.groups.find((g) => g.role === 'core')!;
    const a = core.files.find((f) => f.path === 'src/a.ts')!;
    const b = core.files.find((f) => f.path === 'src/b.ts')!;
    expect(a.finding_lines).toEqual([10, 20]); // deduped + sorted
    expect(b.finding_lines).toEqual([5]);

    const tests = result.groups.find((g) => g.role === 'tests')!;
    const testFile = tests.files.find((f) => f.path === 'src/a.test.ts')!;
    expect(testFile.finding_lines).toEqual([]); // no findings target this file

    const boilerplate = result.groups.find((g) => g.role === 'boilerplate')!;
    expect(boilerplate.files.find((f) => f.path === 'pnpm-lock.yaml')!.finding_lines).toEqual([]);
  });

  it('sums total_lines as additions + deletions across all files', () => {
    // (5+2) + (3+1) + (2+0) + (1+1) = 15
    expect(result.split_suggestion.total_lines).toBe(15);
  });

  it('never proposes a split: too_big is false and proposed_splits is empty', () => {
    expect(result.split_suggestion.too_big).toBe(false);
    expect(result.split_suggestion.proposed_splits).toEqual([]);
  });

  it('produces a body that satisfies the SmartDiff contract', () => {
    expect(() => SmartDiff.parse(result)).not.toThrow();
  });
});

describe('selectLatestReviews', () => {
  interface Row {
    id: string;
    kind: 'summary' | 'review';
    agent_id: string | null;
  }

  it('keeps only the newest review per agent, excludes summary rows, and keeps a single null-agent review', () => {
    // Already newest-first, as `reviewsForPull` returns.
    const rows: Row[] = [
      { id: 'r5', kind: 'review', agent_id: 'agent-a' }, // newest for agent-a
      { id: 'r4', kind: 'summary', agent_id: 'agent-a' }, // summary — always excluded
      { id: 'r3', kind: 'review', agent_id: 'agent-a' }, // older — superseded by r5
      { id: 'r2', kind: 'review', agent_id: 'agent-b' }, // newest (only) for agent-b
      { id: 'r1', kind: 'review', agent_id: null }, // newest (only) for the null-agent key
    ];

    const latest = selectLatestReviews(rows);
    expect(latest.map((r) => r.id)).toEqual(['r5', 'r2', 'r1']);
  });
});
