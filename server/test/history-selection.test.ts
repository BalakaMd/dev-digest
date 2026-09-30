import { describe, it, expect } from 'vitest';
import type { PathPull, PathPullHistory } from '@devdigest/shared';
import {
  buildHistoryNote,
  isHistoryNoise,
  pickHistoryFiles,
  selectPriorPrs,
} from '../src/modules/history/selection.js';
import { HISTORY_MAX_PRS, HISTORY_MAX_PR_CHANGED_FILES } from '../src/modules/history/constants.js';

const pull = (number: number, over: Partial<PathPull> = {}): PathPull => ({
  number,
  title: `PR ${number}`,
  mergedAt: `2026-01-${String(10 + number).padStart(2, '0')}T00:00:00Z`,
  author: 'dev',
  changedFiles: 3,
  ...over,
});
const hist = (...paths: [string, PathPull[]][]): PathPullHistory => ({
  refFound: true,
  paths: paths.map(([path, pulls]) => ({ path, pulls })),
});
const OPTS = { currentPrNumber: 100, maxPrs: HISTORY_MAX_PRS, maxChangedFiles: HISTORY_MAX_PR_CHANGED_FILES };

describe('selectPriorPrs', () => {
  it('drops unmerged PRs and the current PR', () => {
    const out = selectPriorPrs(hist(['a.ts', [pull(1, { mergedAt: null }), pull(100), pull(2)]]), OPTS);
    expect(out.map((i) => i.pr_number)).toEqual([2]);
  });

  it('when the current PR is merged, keeps only PRs merged strictly before it', () => {
    const current = pull(100, { mergedAt: '2026-01-15T00:00:00Z' });
    const before = pull(3, { mergedAt: '2026-01-14T00:00:00Z' });
    const after = pull(4, { mergedAt: '2026-01-16T00:00:00Z' });
    const same = pull(5, { mergedAt: '2026-01-15T00:00:00Z' });
    const out = selectPriorPrs(hist(['a.ts', [current, before, after, same]]), OPTS);
    expect(out.map((i) => i.pr_number)).toEqual([3]);
  });

  it('drops mass refactors above the changed-files limit', () => {
    const out = selectPriorPrs(
      hist(['a.ts', [pull(1, { changedFiles: HISTORY_MAX_PR_CHANGED_FILES + 1 }), pull(2, { changedFiles: HISTORY_MAX_PR_CHANGED_FILES })]]),
      OPTS,
    );
    expect(out.map((i) => i.pr_number)).toEqual([2]);
  });

  it('merges one PR across paths into a deduped overlap in request order', () => {
    const out = selectPriorPrs(hist(['a.ts', [pull(1), pull(1)]], ['b.ts', [pull(1)]]), OPTS);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      pr_number: 1,
      title: 'PR 1',
      author: 'dev',
      files_overlap: ['a.ts', 'b.ts'],
      notes: 'Touches 2 of the same files (3 files changed in total)',
    });
  });

  it('orders by overlap, then merged_at, then number', () => {
    const out = selectPriorPrs(
      hist(
        ['a.ts', [pull(1), pull(2), pull(3), pull(4, { mergedAt: pull(3).mergedAt })]],
        ['b.ts', [pull(1)]],
      ),
      OPTS,
    );
    expect(out.map((i) => i.pr_number)).toEqual([1, 4, 3, 2]);
  });

  it('caps the result at maxPrs', () => {
    const pulls = Array.from({ length: HISTORY_MAX_PRS + 5 }, (_, i) => pull(i + 1));
    expect(selectPriorPrs(hist(['a.ts', pulls]), OPTS)).toHaveLength(HISTORY_MAX_PRS);
  });
});

describe('pickHistoryFiles / isHistoryNoise', () => {
  it('skips lockfiles, vendored, built, snapshot and generated files', () => {
    for (const p of [
      'pnpm-lock.yaml',
      'server/package-lock.json',
      'client/src/vendor/shared/index.ts',
      'dist/x.js',
      'a/node_modules/b.js',
      'src/__snapshots__/a.snap',
      'deps.lock',
      'a.min.js',
      'src/api.generated.ts',
    ]) {
      expect(isHistoryNoise(p), p).toBe(true);
    }
    expect(isHistoryNoise('src/index.ts')).toBe(false);
  });

  it('ranks by churn desc then path asc and honours max', () => {
    const files = [
      { path: 'b.ts', additions: 1, deletions: 1 },
      { path: 'a.ts', additions: 1, deletions: 1 },
      { path: 'big.ts', additions: 50, deletions: 0 },
      { path: 'yarn.lock', additions: 999, deletions: 0 },
    ];
    expect(pickHistoryFiles(files, 10)).toEqual(['big.ts', 'a.ts', 'b.ts']);
    expect(pickHistoryFiles(files, 2)).toEqual(['big.ts', 'a.ts']);
  });
});

describe('buildHistoryNote', () => {
  it('uses singular and plural forms', () => {
    expect(buildHistoryNote(1, 1)).toBe('Touches 1 of the same files (1 file changed in total)');
    expect(buildHistoryNote(3, 12)).toBe('Touches 3 of the same files (12 files changed in total)');
  });
});
