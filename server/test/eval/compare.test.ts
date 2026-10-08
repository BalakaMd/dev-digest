import { describe, expect, it } from 'vitest';
import type { EvalSuiteRun } from '@devdigest/shared';
import { compareRuns, diffConfigs, diffLines } from '../../src/modules/eval/compare.js';
import type { CompareCaseRow } from '../../src/modules/eval/types.js';

const run = (o: Partial<EvalSuiteRun> = {}): EvalSuiteRun => ({
  id: 'r',
  agent_id: 'a',
  agent_version: 1,
  status: 'done',
  error: null,
  started_at: '2026-01-01T00:00:00Z',
  finished_at: '2026-01-01T00:01:00Z',
  cases_total: 0,
  cases_done: 0,
  cases_errored: 0,
  cases_passed: 0,
  recall: null,
  precision: null,
  citation_accuracy: null,
  cost_usd: 0.1,
  duration_ms: 1000,
  ...o,
});

const row = (case_id: string | null, o: Partial<CompareCaseRow> = {}): CompareCaseRow => ({
  case_id,
  case_name: `case-${case_id}`,
  expectation_types: ['must_find'],
  status: 'ok',
  passed: true,
  findings_returned: 1,
  findings_kept: 1,
  must_find_total: 1,
  must_find_matched: 1,
  must_not_flag_hits: 0,
  cost_usd: 0.01,
  ...o,
});

const noDiff = diffConfigs(
  { provider: 'openai', model: 'm', system_prompt: '', skills: [] },
  { provider: 'openai', model: 'm', system_prompt: '', skills: [] },
);

describe('compareRuns', () => {
  it('computes older/newer/delta in percentage points over shared cases (AC-31)', () => {
    const older = { run: run(), cases: [row('1', { must_find_matched: 0, passed: false }), row('2')] };
    const newer = { run: run(), cases: [row('1'), row('2')] };
    const c = compareRuns(older, newer, noDiff);
    expect(c.recall).toEqual({ older: 0.5, newer: 1, delta_pp: 50 });
    expect(c.precision).toEqual({ older: 1, newer: 1, delta_pp: 0 });
    expect(c.shared_case_count).toBe(2);
  });

  it('lists flipped cases with name and expectation types (AC-41)', () => {
    const older = { run: run(), cases: [row('1'), row('2', { passed: false }), row('3')] };
    const newer = {
      run: run(),
      cases: [row('1', { passed: false, expectation_types: ['must_find', 'must_not_flag'] }), row('2'), row('3')],
    };
    const c = compareRuns(older, newer, noDiff);
    expect(c.flipped).toEqual([
      { case_id: '1', case_name: 'case-1', expectation_types: ['must_find', 'must_not_flag'], from: 'passed', to: 'failed' },
      { case_id: '2', case_name: 'case-2', expectation_types: ['must_find'], from: 'failed', to: 'passed' },
    ]);
  });

  it('restricts metrics to cases scored in both runs and lists the rest (AC-33)', () => {
    const older = {
      run: run(),
      cases: [row('1'), row('only-old', { must_find_matched: 0, passed: false }), row(null, { case_name: 'deleted' })],
    };
    const newer = { run: run(), cases: [row('1'), row('only-new'), row(null, { case_name: 'deleted' })] };
    const c = compareRuns(older, newer, noDiff);
    expect(c.shared_case_count).toBe(1);
    expect(c.recall).toEqual({ older: 1, newer: 1, delta_pp: 0 });
    expect(c.only_in_older.map((x) => x.case_name)).toEqual(['case-only-old', 'deleted']);
    expect(c.only_in_newer.map((x) => x.case_name)).toEqual(['case-only-new', 'deleted']);
    expect(c.flipped).toEqual([]);
  });

  it('excludes a case errored in one run from the shared set and counts errors', () => {
    const older = { run: run(), cases: [row('1'), row('2', { status: 'error', passed: null })] };
    const newer = { run: run(), cases: [row('1'), row('2')] };
    const c = compareRuns(older, newer, noDiff);
    expect(c.shared_case_count).toBe(1);
    expect(c.errored).toEqual({ older: 1, newer: 0 });
    expect(c.only_in_older).toEqual([]);
  });

  it('keeps a null delta when a metric has no value (AC-63)', () => {
    const plain = row('1', { must_find_total: 0, must_find_matched: 0 });
    const c = compareRuns({ run: run(), cases: [plain] }, { run: run(), cases: [plain] }, noDiff);
    expect(c.recall).toEqual({ older: null, newer: null, delta_pp: null });
  });

  it('reports cost older/newer/signed delta; unknown stays null, never 0 (AC-45, AC-76)', () => {
    const cases = [row('1')];
    const c = compareRuns(
      { run: run({ cost_usd: 0.1 }), cases },
      { run: run({ cost_usd: 0.35 }), cases },
      noDiff,
    );
    expect(c.cost.older).toBe(0.1);
    expect(c.cost.newer).toBe(0.35);
    expect(c.cost.delta).toBeCloseTo(0.25);
    const unknown = compareRuns({ run: run({ cost_usd: null }), cases }, { run: run({ cost_usd: 0.2 }), cases }, noDiff);
    expect(unknown.cost).toEqual({ older: null, newer: 0.2, delta: null });
  });
});

describe('diffLines', () => {
  it('marks same / add / del lines', () => {
    expect(diffLines('a\nb\nc', 'a\nx\nc')).toEqual([
      { kind: 'same', text: 'a' },
      { kind: 'del', text: 'b' },
      { kind: 'add', text: 'x' },
      { kind: 'same', text: 'c' },
    ]);
  });
  it('handles identical, empty and appended text', () => {
    expect(diffLines('a', 'a')).toEqual([{ kind: 'same', text: 'a' }]);
    expect(diffLines('', 'a\nb')).toEqual([
      { kind: 'add', text: 'a' },
      { kind: 'add', text: 'b' },
    ]);
    expect(diffLines('a\nb', '')).toEqual([
      { kind: 'del', text: 'a' },
      { kind: 'del', text: 'b' },
    ]);
    expect(diffLines('a', 'a\nb').at(-1)).toEqual({ kind: 'add', text: 'b' });
  });
  it('reconstructs both sides from the diff', () => {
    const a = 'one\ntwo\nthree\nfour\nfive';
    const b = 'one\nthree\nfour\nsix\nfive\nseven';
    const d = diffLines(a, b);
    expect(d.filter((l) => l.kind !== 'add').map((l) => l.text).join('\n')).toBe(a);
    expect(d.filter((l) => l.kind !== 'del').map((l) => l.text).join('\n')).toBe(b);
  });
});

describe('diffConfigs (AC-32)', () => {
  const base = { provider: 'openai' as const, model: 'gpt-a', system_prompt: 'p1\np2', skills: ['s1', 's2', 's3'] };
  it('is empty for identical configs', () => {
    const d = diffConfigs(base, base);
    expect(d.provider).toBeNull();
    expect(d.model).toBeNull();
    expect(d.skills).toEqual({ added: [], removed: [], reordered: false });
    expect(d.system_prompt.every((l) => l.kind === 'same')).toBe(true);
  });
  it('reports provider and model only when they differ', () => {
    const d = diffConfigs(base, { ...base, provider: 'anthropic', model: 'claude-x' });
    expect(d.provider).toEqual({ older: 'openai', newer: 'anthropic' });
    expect(d.model).toEqual({ older: 'gpt-a', newer: 'claude-x' });
  });
  it('reports added, removed (by name) and reordered skills', () => {
    const names = new Map([['s1', 'Security'], ['s4', 'Perf']]);
    const d = diffConfigs(base, { ...base, skills: ['s3', 's1', 's4'] }, names);
    expect(d.skills.added).toEqual(['Perf']);
    expect(d.skills.removed).toEqual(['s2']);
    expect(d.skills.reordered).toBe(true);
  });
  it('does not call a pure addition a reorder', () => {
    expect(diffConfigs(base, { ...base, skills: ['s1', 's2', 's3', 's9'] }).skills.reordered).toBe(false);
  });
  it('diffs the system prompt', () => {
    expect(diffConfigs(base, { ...base, system_prompt: 'p1\np3' }).system_prompt).toEqual([
      { kind: 'same', text: 'p1' },
      { kind: 'del', text: 'p2' },
      { kind: 'add', text: 'p3' },
    ]);
  });
});
