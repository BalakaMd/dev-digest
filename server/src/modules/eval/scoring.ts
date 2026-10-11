import type { EvalExpectation } from '@devdigest/shared';
import type { CaseCounters, CaseScore, RunScore, ScorableFinding, ScoreCaseInput } from './types.js';

/**
 * Pure scorer (SPEC-06, AC-21...26, 63, 68, 69). No IO, no clock, no LLM, no
 * provider parameter: the same findings and cases always give the same numbers
 * (NFR-1). An expectation's title, severity and category are never read.
 */

function span(a: number, b: number): [number, number] {
  return a <= b ? [a, b] : [b, a];
}

/** AC-21: same file, inclusive line ranges intersect (a reversed range is normalised first). */
export function matches(
  finding: ScorableFinding,
  expectation: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>,
): boolean {
  if (finding.file !== expectation.file) return false;
  const [fs, fe] = span(finding.start_line, finding.end_line);
  const [es, ee] = span(expectation.start_line, expectation.end_line);
  return fs <= ee && es <= fe;
}

/** Score one case: counters, per-finding matched flags, per-expectation matches and the verdict (AC-25). */
export function scoreCase({ expectations, kept, dropped }: ScoreCaseInput): CaseScore {
  const finding_matched: boolean[] = kept.map(() => false);
  const mustNotFlagHit: boolean[] = kept.map(() => false);
  const expectation_matches = expectations.map((exp, expectation_index) => {
    const finding_indexes: number[] = [];
    kept.forEach((f, i) => {
      if (!matches(f, exp)) return;
      finding_indexes.push(i);
      finding_matched[i] = true;
      if (exp.type === 'must_not_flag') mustNotFlagHit[i] = true;
    });
    return { expectation_index, matched: finding_indexes.length > 0, finding_indexes };
  });

  let must_find_total = 0;
  let must_find_matched = 0;
  expectations.forEach((exp, i) => {
    if (exp.type !== 'must_find') return;
    must_find_total += 1;
    if (expectation_matches[i]!.matched) must_find_matched += 1;
  });
  const must_not_flag_hits = mustNotFlagHit.filter(Boolean).length;

  return {
    passed: must_find_matched === must_find_total && must_not_flag_hits === 0,
    findings_returned: kept.length + dropped.length,
    findings_kept: kept.length,
    must_find_total,
    must_find_matched,
    must_not_flag_hits,
    finding_matched,
    expectation_matches,
  };
}

function ratio(num: number, den: number): number | null {
  return den === 0 ? null : num / den;
}

/**
 * Micro-average over the scored (status `ok`) cases of a run (AC-22/23/24/63/68, AC-76).
 * Error cases are counted but contribute nothing to the metrics.
 */
export function scoreRun(cases: CaseCounters[]): RunScore {
  const scored = cases.filter((c) => c.status === 'ok');
  let mustFind = 0;
  let mustFindMatched = 0;
  let hits = 0;
  let kept = 0;
  let returned = 0;
  let passed = 0;
  const costs: number[] = [];
  let costKnown = true;
  for (const c of scored) {
    mustFind += c.must_find_total;
    mustFindMatched += c.must_find_matched;
    hits += c.must_not_flag_hits;
    kept += c.findings_kept;
    returned += c.findings_returned;
    if (c.passed) passed += 1;
    if (c.cost_usd === null) costKnown = false;
    else costs.push(c.cost_usd);
  }
  const hitRate = ratio(hits, kept);
  return {
    cases_scored: scored.length,
    cases_errored: cases.length - scored.length,
    cases_passed: passed,
    recall: ratio(mustFindMatched, mustFind),
    precision: hitRate === null ? null : 1 - hitRate,
    citation_accuracy: ratio(kept, returned),
    // Summed in ascending order so float addition does not depend on case order (NFR-1).
    cost_usd:
      scored.length === 0 || !costKnown ? null : costs.sort((a, b) => a - b).reduce((s, x) => s + x, 0),
  };
}
