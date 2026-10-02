import { describe, it, expect } from 'vitest';
import type { PrBlastRadiusResponse } from '@devdigest/shared';
import { projectBlast, renderBlastText } from '../src/format/blast.js';
import { BLAST_REASON_TEXT, OUTPUT_BUDGET_CHARS } from '../src/constants.js';

/** Well above any per-symbol cut-off the old concise format used. */
const MANY = 40;

const PR_LABEL = 'acme/payments-api#482';

function response(over: Partial<PrBlastRadiusResponse> = {}): PrBlastRadiusResponse {
  return {
    changed_symbols: [{ name: 'charge', file: 'src/pay.ts', kind: 'function' }],
    downstream: [],
    summary: '1 changed symbol · 0 callers · 0 endpoints · 0 crons/jobs',
    degraded: false,
    degraded_reason: null,
    indexed_sha: 'abc123',
    ...over,
  };
}

function callers(n: number): PrBlastRadiusResponse['downstream'][number]['callers'] {
  return Array.from({ length: n }, (_, i) => ({ name: `caller${i}`, file: `src/c${i}.ts`, line: i + 1 }));
}

function withCallers(n: number, extra: Partial<PrBlastRadiusResponse['downstream'][number]> = {}) {
  return response({
    downstream: [
      { symbol: 'charge', callers: callers(n), endpoints_affected: [], crons_affected: [], ...extra },
    ],
  });
}

const render = (res: PrBlastRadiusResponse, detailed = false) =>
  renderBlastText(projectBlast(res, { detailed }), PR_LABEL);

describe('projectBlast', () => {
  it('concise keeps every caller the API returned, in server order, with no "more" counter', () => {
    const p = projectBlast(withCallers(MANY), { detailed: false });
    expect(p.detailed).toBe(false);
    expect(p.downstream[0]!.callers).toHaveLength(MANY);
    expect(p.downstream[0]!.totalCallers).toBe(MANY);
    expect(p.downstream[0]!.callers[0]!.name).toBe('caller0');
    expect(p.downstream[0]).not.toHaveProperty('moreCallers');
  });

  it('detailed keeps every caller too and only differs by the detailed flag', () => {
    const p = projectBlast(withCallers(MANY), { detailed: true });
    expect(p.detailed).toBe(true);
    expect(p.downstream[0]!.callers).toHaveLength(MANY);
    expect(p.downstream[0]!.totalCallers).toBe(MANY);
    expect(p.downstream[0]).not.toHaveProperty('moreCallers');
  });

  it('carries the degradation marker and changed-symbol count through', () => {
    const p = projectBlast(response({ degraded: true, degraded_reason: 'no_data' }), { detailed: false });
    expect(p).toMatchObject({ degraded: true, degradedReason: 'no_data', changedCount: 1, indexedSha: 'abc123' });
  });
});

describe('renderBlastText', () => {
  it('starts with the PR label and the summary', () => {
    const text = render(withCallers(1));
    expect(text.split('\n')[0]).toBe(`Blast radius of ${PR_LABEL} — ${response().summary}`);
  });

  it('concise lists callers as bare file:line, without the enclosing function name', () => {
    const text = render(withCallers(2));
    expect(text).toContain('charge — 2 callers');
    expect(text).toContain('  ← src/c0.ts:1\n');
    expect(text).toContain('  ← src/c1.ts:2');
    expect(text).not.toContain('(caller0)');
    expect(text).not.toContain('(caller1)');
  });

  it('uses the singular "1 caller" for a symbol with a single caller', () => {
    const text = render(withCallers(1));
    expect(text).toContain('charge — 1 caller\n');
    expect(text).not.toContain('1 callers');
  });

  it('concise lists every caller and never says callers were left out; detailed lists the same callers', () => {
    const concise = render(withCallers(MANY));
    expect(concise).toContain(`charge — ${MANY} callers`);
    for (let i = 0; i < MANY; i++) expect(concise).toContain(`  ← src/c${i}.ts:${i + 1}`);
    expect(concise).not.toMatch(/… \d+ more/);
    expect(concise).not.toContain('output truncated');

    const detailed = render(withCallers(MANY), true);
    expect(detailed).toContain(`  ← src/c${MANY - 1}.ts:${MANY} (caller${MANY - 1})`);
    expect(detailed).not.toMatch(/… \d+ more/);
  });

  it('detailed appends the enclosing function name to each caller', () => {
    const text = render(withCallers(2), true);
    expect(text).toContain('  ← src/c0.ts:1 (caller0)');
    expect(text).toContain('  ← src/c1.ts:2 (caller1)');
  });

  it('detailed adds the indexed-commit line when the sha is known; concise does not', () => {
    const line = 'Indexed at abc123 (caller line numbers refer to this commit).';
    expect(render(withCallers(1), true)).toContain(line);
    expect(render(withCallers(1), false)).not.toContain('Indexed at');
  });

  it('detailed omits the indexed-commit line when no sha is known', () => {
    const text = render({ ...withCallers(1), indexed_sha: null }, true);
    expect(text).not.toContain('Indexed at');
    expect(text).toContain('  ← src/c0.ts:1 (caller0)');
  });

  it('renders endpoints and crons on separate lines, omitting empty ones', () => {
    const both = render(
      withCallers(1, { endpoints_affected: ['GET /a', 'POST /b'], crons_affected: ['0 * * * *'] }),
    );
    expect(both).toContain('  endpoints: GET /a, POST /b');
    expect(both).toContain('  crons/jobs: 0 * * * *');

    const none = render(withCallers(1));
    expect(none).not.toContain('endpoints:');
    expect(none).not.toContain('crons/jobs:');
  });

  it('keeps the server order of symbols', () => {
    const res = response({
      downstream: [
        { symbol: 'zeta', callers: callers(1), endpoints_affected: [], crons_affected: [] },
        { symbol: 'alpha', callers: callers(1), endpoints_affected: [], crons_affected: [] },
      ],
    });
    const text = render(res);
    expect(text.indexOf('zeta —')).toBeLessThan(text.indexOf('alpha —'));
  });

  it('says so when no symbol has callers', () => {
    const text = render(response({ changed_symbols: [
      { name: 'a', file: 'x.ts', kind: 'function' },
      { name: 'b', file: 'x.ts', kind: 'function' },
    ] }));
    expect(text).toContain('No downstream callers found for 2 changed symbol(s).');
    expect(text).not.toContain('Index incomplete');
  });

  it('when the PR has no changed symbols at all, hints to open the PR in the studio', () => {
    const text = render(response({ changed_symbols: [] }));
    expect(text).toContain('No downstream callers found for 0 changed symbol(s).');
    expect(text).toMatch(/Open this PR once in the DevDigest studio/);
  });

  it('a healthy response has no "Index incomplete" line', () => {
    expect(render(withCallers(1))).not.toContain('Index incomplete');
  });

  it.each(Object.entries(BLAST_REASON_TEXT))(
    'a degraded response with reason %s carries an "Index incomplete" line with its hint',
    (reason, hint) => {
      const text = render(
        response({ degraded: true, degraded_reason: reason as PrBlastRadiusResponse['degraded_reason'] }),
      );
      expect(text).toContain(`Index incomplete (${reason}): ${hint}`);
      expect(text).toContain('POST /repos/:id/resync');
    },
  );

  it('a degraded response still lists the callers it did find (partial index)', () => {
    const text = render({ ...withCallers(1), degraded: true, degraded_reason: 'index_partial' });
    expect(text).toContain('Index incomplete (index_partial)');
    expect(text).toContain('← src/c0.ts:1');
  });

  it('enforces the output budget with a truncation note', () => {
    const many = response({
      downstream: Array.from({ length: 400 }, (_, i) => ({
        symbol: `symbol_${i}_${'x'.repeat(40)}`,
        callers: callers(5),
        endpoints_affected: Array.from({ length: 5 }, (_, j) => `GET /route/${i}/${j}`),
        crons_affected: [],
      })),
    });
    const text = render(many);
    expect(text.length).toBeLessThanOrEqual(OUTPUT_BUDGET_CHARS);
    expect(text).toContain('output truncated');
    // The header (with the summary) survives truncation.
    expect(text.startsWith(`Blast radius of ${PR_LABEL}`)).toBe(true);
  });

  it('does not truncate output that fits the budget', () => {
    expect(render(withCallers(3))).not.toContain('output truncated');
  });
});
