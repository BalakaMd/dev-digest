/**
 * filterOutOfScope — the scope gate applied AFTER citation grounding, only
 * when a PR intent was supplied. Pins: in/null/undefined scope is kept, the
 * four scanner kinds are never dropped, at most one CRITICAL out-of-scope
 * signal survives (tie-break: security category, then confidence, then
 * original order), and every drop carries a reason.
 */
import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { filterOutOfScope } from '../src/scope.js';

let nextId = 0;

function finding(overrides: Partial<Finding> = {}): Finding {
  nextId += 1;
  return {
    id: `f${nextId}`,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${nextId}`,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.5,
    kind: 'finding',
    ...overrides,
  };
}

describe('filterOutOfScope', () => {
  it('keeps findings with scope "in", null, or undefined, untouched', () => {
    const inScope = finding({ scope: 'in' });
    const nullScope = finding({ scope: null });
    const undefinedScope = finding({ scope: undefined });
    const result = filterOutOfScope([inScope, nullScope, undefinedScope]);
    expect(result.kept).toEqual([inScope, nullScope, undefinedScope]);
    expect(result.dropped).toHaveLength(0);
    expect(result.signal).toBeNull();
  });

  it('never drops the four scanner kinds, even when scope is "out"', () => {
    const kinds: Finding['kind'][] = ['secret_leak', 'lethal_trifecta', 'phantom', 'hook'];
    const scanners = kinds.map((kind) =>
      finding({ kind, scope: 'out', severity: 'WARNING' }),
    );
    const result = filterOutOfScope(scanners);
    expect(result.kept).toHaveLength(4);
    expect(result.dropped).toHaveLength(0);
    // scanner findings are not eligible for the "signal" slot either — they
    // were never in the out-of-scope pool to begin with.
    expect(result.signal).toBeNull();
  });

  it('drops out-of-scope findings when none is CRITICAL, keeping no signal', () => {
    const warn = finding({ scope: 'out', severity: 'WARNING' });
    const suggestion = finding({ scope: 'out', severity: 'SUGGESTION' });
    const result = filterOutOfScope([warn, suggestion]);
    expect(result.kept).toHaveLength(0);
    expect(result.signal).toBeNull();
    expect(result.dropped).toEqual([
      { finding: warn, reason: 'out of PR scope' },
      { finding: suggestion, reason: 'out of PR scope' },
    ]);
  });

  it('keeps the single CRITICAL out-of-scope finding as a signal, dropping the rest', () => {
    const critical = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug' });
    const warn = finding({ scope: 'out', severity: 'WARNING' });
    const result = filterOutOfScope([warn, critical]);
    expect(result.signal).toBe(critical);
    expect(result.kept).toEqual([critical]);
    expect(result.dropped).toEqual([
      { finding: warn, reason: 'out of PR scope — one signal already kept' },
    ]);
  });

  it('tie-break: among multiple CRITICALs, security category wins first', () => {
    const bugCritical = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug', confidence: 0.9 });
    const securityCritical = finding({
      scope: 'out',
      severity: 'CRITICAL',
      category: 'security',
      confidence: 0.4,
    });
    const result = filterOutOfScope([bugCritical, securityCritical]);
    expect(result.signal).toBe(securityCritical);
    expect(result.dropped.map((d) => d.finding)).toEqual([bugCritical]);
  });

  it('tie-break: same category, higher confidence wins next', () => {
    const lowConfidence = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug', confidence: 0.3 });
    const highConfidence = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug', confidence: 0.8 });
    const result = filterOutOfScope([lowConfidence, highConfidence]);
    expect(result.signal).toBe(highConfidence);
  });

  it('tie-break: same category and confidence, original order wins', () => {
    const first = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug', confidence: 0.7 });
    const second = finding({ scope: 'out', severity: 'CRITICAL', category: 'bug', confidence: 0.7 });
    const result = filterOutOfScope([first, second]);
    expect(result.signal).toBe(first);
    expect(result.dropped.map((d) => d.finding)).toEqual([second]);
  });

  it('every dropped finding carries a reason (nothing dropped silently)', () => {
    const findings = [
      finding({ scope: 'out', severity: 'CRITICAL' }),
      finding({ scope: 'out', severity: 'WARNING' }),
      finding({ scope: 'out', severity: 'SUGGESTION' }),
    ];
    const result = filterOutOfScope(findings);
    expect(result.dropped).toHaveLength(2);
    for (const d of result.dropped) {
      expect(typeof d.reason).toBe('string');
      expect(d.reason.length).toBeGreaterThan(0);
    }
  });

  it('mixes in-scope, out-of-scope and scanner findings correctly', () => {
    const inScope = finding({ scope: 'in' });
    const critical = finding({ scope: 'out', severity: 'CRITICAL' });
    const warn = finding({ scope: 'out', severity: 'WARNING' });
    const secret = finding({ kind: 'secret_leak', scope: 'out', severity: 'WARNING' });
    const result = filterOutOfScope([inScope, critical, warn, secret]);
    expect(result.kept).toEqual(expect.arrayContaining([inScope, critical, secret]));
    expect(result.kept).toHaveLength(3);
    expect(result.dropped).toEqual([
      { finding: warn, reason: 'out of PR scope — one signal already kept' },
    ]);
    expect(result.signal).toBe(critical);
  });
});
