import { describe, expect, it } from 'vitest';
import type { EvalExpectation } from '@devdigest/shared';
import { matches, scoreCase, scoreRun } from '../../src/modules/eval/scoring.js';
import type { CaseCounters } from '../../src/modules/eval/types.js';

const exp = (
  type: EvalExpectation['type'],
  file: string,
  start_line: number,
  end_line: number,
  extra: Partial<EvalExpectation> = {},
): EvalExpectation => ({ type, file, start_line, end_line, ...extra });
const f = (file: string, start_line: number, end_line = start_line) => ({ file, start_line, end_line });

describe('matches (AC-21)', () => {
  const e = exp('must_find', 'a.ts', 10, 20);
  it('is inclusive at both bounds', () => {
    expect(matches(f('a.ts', 20, 25), e)).toBe(true);
    expect(matches(f('a.ts', 5, 10), e)).toBe(true);
    expect(matches(f('a.ts', 21, 25), e)).toBe(false);
    expect(matches(f('a.ts', 1, 9), e)).toBe(false);
  });
  it('normalises reversed ranges on either side', () => {
    expect(matches(f('a.ts', 15, 12), e)).toBe(true);
    expect(matches(f('a.ts', 12), exp('must_find', 'a.ts', 20, 10))).toBe(true);
    expect(matches(f('a.ts', 30, 25), exp('must_find', 'a.ts', 20, 10))).toBe(false);
  });
  it('requires equal file paths', () => {
    expect(matches(f('b.ts', 15), e)).toBe(false);
  });
});

describe('scoreCase', () => {
  it('passes when every must_find is matched and nothing hits must_not_flag (AC-25)', () => {
    const r = scoreCase({
      expectations: [exp('must_find', 'a.ts', 10, 12), exp('must_not_flag', 'a.ts', 50, 60)],
      kept: [f('a.ts', 11), f('z.ts', 1)],
      dropped: [f('a.ts', 999)],
    });
    expect(r).toMatchObject({
      passed: true,
      findings_returned: 3,
      findings_kept: 2,
      must_find_total: 1,
      must_find_matched: 1,
      must_not_flag_hits: 0,
      finding_matched: [true, false],
    });
    expect(r.expectation_matches).toEqual([
      { expectation_index: 0, matched: true, finding_indexes: [0] },
      { expectation_index: 1, matched: false, finding_indexes: [] },
    ]);
  });

  it('unmatched findings do not change the outcome (AC-25)', () => {
    const base = { expectations: [exp('must_find', 'a.ts', 1, 2)], dropped: [] };
    const without = scoreCase({ ...base, kept: [f('a.ts', 1)] });
    const withNoise = scoreCase({ ...base, kept: [f('a.ts', 1), f('q.ts', 4), f('a.ts', 400)] });
    expect(withNoise.passed).toBe(without.passed);
    expect(withNoise.must_find_matched).toBe(without.must_find_matched);
  });

  it('fails on a missed must_find or on a must_not_flag hit', () => {
    expect(scoreCase({ expectations: [exp('must_find', 'a.ts', 1, 2)], kept: [], dropped: [] }).passed).toBe(false);
    const hit = scoreCase({ expectations: [exp('must_not_flag', 'a.ts', 1, 9)], kept: [f('a.ts', 3)], dropped: [] });
    expect(hit.passed).toBe(false);
    expect(hit.must_not_flag_hits).toBe(1);
  });

  it('counts a finding matching two must_not_flag expectations once', () => {
    const r = scoreCase({
      expectations: [exp('must_not_flag', 'a.ts', 1, 9), exp('must_not_flag', 'a.ts', 3, 4)],
      kept: [f('a.ts', 3)],
      dropped: [],
    });
    expect(r.must_not_flag_hits).toBe(1);
  });

  it('a dropped finding never matches (grounding gate)', () => {
    const r = scoreCase({ expectations: [exp('must_find', 'a.ts', 1, 9)], kept: [], dropped: [f('a.ts', 3)] });
    expect(r.must_find_matched).toBe(0);
    expect(r.findings_returned).toBe(1);
  });

  it('ignores title, severity and category (AC-69)', () => {
    const input = { kept: [f('a.ts', 5)], dropped: [] };
    const plain = scoreCase({ ...input, expectations: [exp('must_find', 'a.ts', 4, 6)] });
    const noted = scoreCase({
      ...input,
      expectations: [exp('must_find', 'a.ts', 4, 6, { title: 'x', severity: 'critical', category: 'security' })],
    });
    expect(noted).toEqual(plain);
  });
});

const row = (o: Partial<CaseCounters> = {}): CaseCounters => ({
  status: 'ok',
  passed: true,
  findings_returned: 0,
  findings_kept: 0,
  must_find_total: 0,
  must_find_matched: 0,
  must_not_flag_hits: 0,
  cost_usd: 0.01,
  ...o,
});

describe('scoreRun', () => {
  it('micro-averages across cases (AC-22/23/24)', () => {
    const r = scoreRun([
      row({ must_find_total: 1, must_find_matched: 1, findings_kept: 1, findings_returned: 1 }),
      row({
        passed: false,
        must_find_total: 3,
        must_find_matched: 1,
        must_not_flag_hits: 1,
        findings_kept: 3,
        findings_returned: 5,
      }),
    ]);
    expect(r.recall).toBeCloseTo(2 / 4); // micro, not mean(1, 1/3)
    expect(r.precision).toBeCloseTo(1 - 1 / 4);
    expect(r.citation_accuracy).toBeCloseTo(4 / 6);
    expect(r).toMatchObject({ cases_scored: 2, cases_passed: 1, cases_errored: 0 });
  });

  it('returns null for a metric whose denominator is 0 (AC-63)', () => {
    const r = scoreRun([row({ passed: true })]);
    expect(r.recall).toBeNull();
    expect(r.precision).toBeNull();
    expect(r.citation_accuracy).toBeNull();
    expect(scoreRun([]).recall).toBeNull();
  });

  it('precision is 1 when findings exist but none hit a must_not_flag', () => {
    expect(scoreRun([row({ findings_kept: 4, findings_returned: 4 })]).precision).toBe(1);
  });

  it('excludes error cases from metrics but counts them (AC-68)', () => {
    const r = scoreRun([
      row({ must_find_total: 2, must_find_matched: 2, findings_kept: 1, findings_returned: 1 }),
      row({ status: 'error', passed: null, must_find_total: 5, cost_usd: null }),
    ]);
    expect(r).toMatchObject({ cases_scored: 1, cases_errored: 1, cases_passed: 1, recall: 1, cost_usd: 0.01 });
  });

  it('cost is the sum, or null if any scored case is unknown (AC-76)', () => {
    expect(scoreRun([row({ cost_usd: 0.25 }), row({ cost_usd: 0.5 })]).cost_usd).toBeCloseTo(0.75);
    expect(scoreRun([row({ cost_usd: 0.25 }), row({ cost_usd: null })]).cost_usd).toBeNull();
    expect(scoreRun([]).cost_usd).toBeNull();
  });

  it('is independent of case order (NFR-1)', () => {
    const cases = [
      row({ must_find_total: 1, must_find_matched: 1, findings_kept: 2, findings_returned: 3, cost_usd: 0.1 }),
      row({ passed: false, must_find_total: 2, must_find_matched: 0, must_not_flag_hits: 1, findings_kept: 1, findings_returned: 1, cost_usd: 0.2 }),
      row({ must_find_total: 1, must_find_matched: 1, findings_kept: 0, findings_returned: 2, cost_usd: 0.3 }),
    ];
    const a = scoreRun(cases);
    const b = scoreRun([...cases].reverse());
    const c = scoreRun([cases[1]!, cases[2]!, cases[0]!]);
    expect(b).toEqual(a);
    expect(c).toEqual(a);
  });

  it('scoreCase is repeatable on shuffled findings (NFR-1)', () => {
    const expectations = [exp('must_find', 'a.ts', 1, 5), exp('must_find', 'b.ts', 1, 5), exp('must_not_flag', 'c.ts', 1, 5)];
    const kept = [f('a.ts', 2), f('c.ts', 3), f('b.ts', 4), f('d.ts', 1)];
    const x = scoreCase({ expectations, kept, dropped: [f('a.ts', 99)] });
    const y = scoreCase({ expectations, kept: [...kept].reverse(), dropped: [f('a.ts', 99)] });
    const pick = (s: typeof x) => [s.passed, s.must_find_matched, s.must_not_flag_hits, s.findings_kept];
    expect(pick(y)).toEqual(pick(x));
  });
});
