import { describe, it, expect } from 'vitest';
import { BlastRadius, PrBlastRadiusResponse } from '@devdigest/shared';
import {
  resolveDegradation,
  summarizeBlast,
  toBlastRadius,
} from '../src/modules/blast/mapping.js';
import { MAX_CALLERS_PER_SYMBOL } from '../src/modules/repo-intel/constants.js';
import type { BlastCallerRow, BlastResult } from '../src/modules/repo-intel/types.js';

/**
 * Pure unit coverage of the flat facade result -> grouped `BlastRadius`
 * mapping. No I/O, no fakes: every input is a literal `BlastResult`.
 */

const LIMIT = { maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL };

function caller(over: Partial<BlastCallerRow> & Pick<BlastCallerRow, 'file' | 'viaSymbol'>): BlastCallerRow {
  return { symbol: 'fn', line: 1, rank: 0.1, ...over };
}

function result(over: Partial<BlastResult> = {}): BlastResult {
  return {
    changedSymbols: [{ name: 'getContext', file: 'src/ctx.ts', kind: 'function' }],
    callers: [],
    impactedEndpoints: [],
    ...over,
  };
}

describe('toBlastRadius — grouping', () => {
  it('groups the flat caller list by the changed symbol it reaches', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          { name: 'getContext', file: 'src/ctx.ts', kind: 'function' },
          { name: 'IdParams', file: 'src/ctx.ts', kind: 'const' },
        ],
        callers: [
          caller({ file: 'src/a.ts', viaSymbol: 'getContext', symbol: 'listA', line: 10 }),
          caller({ file: 'src/b.ts', viaSymbol: 'IdParams', symbol: 'routeB', line: 4 }),
          caller({ file: 'src/c.ts', viaSymbol: 'getContext', symbol: 'listC', line: 7 }),
        ],
      }),
      LIMIT,
    );

    const bySymbol = Object.fromEntries(out.downstream.map((d) => [d.symbol, d.callers]));
    expect(Object.keys(bySymbol).sort()).toEqual(['IdParams', 'getContext']);
    expect(bySymbol.getContext).toEqual(
      expect.arrayContaining([
        { name: 'listA', file: 'src/a.ts', line: 10 },
        { name: 'listC', file: 'src/c.ts', line: 7 },
      ]),
    );
    expect(bySymbol.getContext).toHaveLength(2);
    expect(bySymbol.IdParams).toEqual([{ name: 'routeB', file: 'src/b.ts', line: 4 }]);
  });

  it('lists every changed symbol, but downstream only holds symbols with callers', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          { name: 'used', file: 'src/x.ts', kind: 'function' },
          { name: 'lonely', file: 'src/x.ts', kind: 'class' },
        ],
        callers: [caller({ file: 'src/a.ts', viaSymbol: 'used' })],
      }),
      LIMIT,
    );
    expect(out.changed_symbols).toEqual([
      { name: 'used', file: 'src/x.ts', kind: 'function' },
      { name: 'lonely', file: 'src/x.ts', kind: 'class' },
    ]);
    expect(out.downstream.map((d) => d.symbol)).toEqual(['used']);
  });

  it('never lists the file that declares a symbol among that symbol\'s own callers', () => {
    const out = toBlastRadius(
      result({
        callers: [
          caller({ file: 'src/ctx.ts', viaSymbol: 'getContext', symbol: 'selfUse', line: 50 }),
          caller({ file: 'src/a.ts', viaSymbol: 'getContext', symbol: 'listA', line: 3 }),
        ],
      }),
      LIMIT,
    );
    const files = out.downstream.flatMap((d) => d.callers.map((c) => c.file));
    expect(files).toEqual(['src/a.ts']);
  });

  it('drops the declaring file only for the symbol it declares (other symbols keep it)', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          { name: 'getContext', file: 'src/ctx.ts', kind: 'function' },
          { name: 'other', file: 'src/other.ts', kind: 'function' },
        ],
        callers: [
          // src/ctx.ts declares getContext, but is a genuine caller of `other`.
          caller({ file: 'src/ctx.ts', viaSymbol: 'other', symbol: 'helper', line: 9 }),
          caller({ file: 'src/ctx.ts', viaSymbol: 'getContext', symbol: 'selfUse', line: 50 }),
        ],
      }),
      LIMIT,
    );
    expect(out.downstream).toHaveLength(1);
    expect(out.downstream[0]!.symbol).toBe('other');
    expect(out.downstream[0]!.callers).toEqual([{ name: 'helper', file: 'src/ctx.ts', line: 9 }]);
  });

  it('de-duplicates identical file|symbol|line callers', () => {
    const dup = caller({ file: 'src/a.ts', viaSymbol: 'getContext', symbol: 'listA', line: 10 });
    const out = toBlastRadius(
      result({
        callers: [dup, { ...dup }, { ...dup, line: 11 }],
      }),
      LIMIT,
    );
    expect(out.downstream[0]!.callers.map((c) => c.line).sort()).toEqual([10, 11]);
  });
});

describe('toBlastRadius — limits and ordering', () => {
  const many = (n: number, via = 'getContext'): BlastCallerRow[] =>
    Array.from({ length: n }, (_, i) =>
      caller({ file: `src/caller-${String(i).padStart(2, '0')}.ts`, viaSymbol: via, line: i + 1 }),
    );

  it('caps callers per symbol at the constant from repo-intel/constants.ts', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          { name: 'getContext', file: 'src/ctx.ts', kind: 'function' },
          { name: 'small', file: 'src/ctx.ts', kind: 'function' },
        ],
        callers: [...many(MAX_CALLERS_PER_SYMBOL + 5), ...many(3, 'small')],
      }),
      LIMIT,
    );
    const counts = Object.fromEntries(out.downstream.map((d) => [d.symbol, d.callers.length]));
    expect(counts).toEqual({ getContext: MAX_CALLERS_PER_SYMBOL, small: 3 });
  });

  it('applies whatever cap it is given (the limit is a parameter, not a literal)', () => {
    const out = toBlastRadius(result({ callers: many(6) }), { maxCallersPerSymbol: 2 });
    expect(out.downstream[0]!.callers).toHaveLength(2);
  });

  it('keeps the highest-ranked callers when capping, ordered rank desc then file then line', () => {
    const out = toBlastRadius(
      result({
        callers: [
          caller({ file: 'src/low.ts', viaSymbol: 'getContext', rank: 0.01 }),
          caller({ file: 'src/b.ts', viaSymbol: 'getContext', rank: 0.5, line: 2 }),
          caller({ file: 'src/a.ts', viaSymbol: 'getContext', rank: 0.5, line: 9 }),
          caller({ file: 'src/a.ts', viaSymbol: 'getContext', symbol: 'other', rank: 0.5, line: 3 }),
        ],
      }),
      { maxCallersPerSymbol: 3 },
    );
    expect(out.downstream[0]!.callers.map((c) => `${c.file}:${c.line}`)).toEqual([
      'src/a.ts:3',
      'src/a.ts:9',
      'src/b.ts:2',
    ]);
  });

  it('orders downstream by best caller rank, then caller count, then name', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: ['zeta', 'alpha', 'beta', 'top'].map((name) => ({
          name,
          file: 'src/ctx.ts',
          kind: 'function',
        })),
        callers: [
          caller({ file: 'src/1.ts', viaSymbol: 'zeta', rank: 0.2 }),
          caller({ file: 'src/2.ts', viaSymbol: 'alpha', rank: 0.2 }),
          caller({ file: 'src/3.ts', viaSymbol: 'beta', rank: 0.2 }),
          caller({ file: 'src/4.ts', viaSymbol: 'beta', rank: 0.1 }),
          caller({ file: 'src/5.ts', viaSymbol: 'top', rank: 0.9 }),
        ],
      }),
      LIMIT,
    );
    // top (rank .9) > beta (rank .2, 2 callers) > alpha = zeta (rank .2, 1 caller; name asc)
    expect(out.downstream.map((d) => d.symbol)).toEqual(['top', 'beta', 'alpha', 'zeta']);
  });
});

describe('toBlastRadius — endpoints and crons', () => {
  it('attributes endpoints and crons per group, keeping them in separate lists', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          { name: 'getContext', file: 'src/ctx.ts', kind: 'function' },
          { name: 'other', file: 'src/ctx.ts', kind: 'function' },
        ],
        callers: [
          caller({ file: 'src/routes.ts', viaSymbol: 'getContext' }),
          caller({ file: 'src/jobs.ts', viaSymbol: 'other' }),
        ],
        factsByFile: {
          'src/routes.ts': { endpoints: ['GET /a', 'POST /b'], crons: [] },
          'src/jobs.ts': { endpoints: [], crons: ['0 * * * *'] },
        },
      }),
      LIMIT,
    );
    const by = Object.fromEntries(out.downstream.map((d) => [d.symbol, d]));
    expect(by.getContext).toMatchObject({ endpoints_affected: ['GET /a', 'POST /b'], crons_affected: [] });
    expect(by.other).toMatchObject({ endpoints_affected: [], crons_affected: ['0 * * * *'] });
  });

  it('prefers reachableFactsByFile over factsByFile when the facade supplies it', () => {
    const out = toBlastRadius(
      result({
        callers: [caller({ file: 'src/svc.ts', viaSymbol: 'getContext' })],
        factsByFile: { 'src/svc.ts': { endpoints: ['GET /direct'], crons: [] } },
        reachableFactsByFile: {
          'src/svc.ts': { endpoints: ['GET /direct', 'GET /via-importer'], crons: ['@daily'] },
        },
      }),
      LIMIT,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /direct', 'GET /via-importer']);
    expect(out.downstream[0]!.crons_affected).toEqual(['@daily']);
  });

  it('falls back to factsByFile when there is no reachable map', () => {
    const out = toBlastRadius(
      result({
        callers: [caller({ file: 'src/svc.ts', viaSymbol: 'getContext' })],
        factsByFile: { 'src/svc.ts': { endpoints: ['GET /direct'], crons: [] } },
      }),
      LIMIT,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /direct']);
  });

  it('unions endpoints across a group\'s caller files without duplicates, first-seen order', () => {
    const out = toBlastRadius(
      result({
        callers: [
          caller({ file: 'src/a.ts', viaSymbol: 'getContext', rank: 0.9 }),
          caller({ file: 'src/b.ts', viaSymbol: 'getContext', rank: 0.5 }),
        ],
        factsByFile: {
          'src/a.ts': { endpoints: ['GET /x', 'GET /y'], crons: [] },
          'src/b.ts': { endpoints: ['GET /y', 'GET /z'], crons: [] },
        },
      }),
      LIMIT,
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /x', 'GET /y', 'GET /z']);
  });

  it('ignores facts of caller files that were dropped by the cap', () => {
    const out = toBlastRadius(
      result({
        callers: [
          caller({ file: 'src/kept.ts', viaSymbol: 'getContext', rank: 0.9 }),
          caller({ file: 'src/cut.ts', viaSymbol: 'getContext', rank: 0.1 }),
        ],
        factsByFile: {
          'src/kept.ts': { endpoints: ['GET /kept'], crons: [] },
          'src/cut.ts': { endpoints: ['GET /cut'], crons: [] },
        },
      }),
      { maxCallersPerSymbol: 1 },
    );
    expect(out.downstream[0]!.endpoints_affected).toEqual(['GET /kept']);
  });
});

describe('summarizeBlast / summary', () => {
  it('renders plural wording', () => {
    expect(summarizeBlast({ symbols: 2, callers: 14, endpoints: 3, crons: 2 })).toBe(
      '2 changed symbols · 14 callers · 3 endpoints · 2 crons/jobs',
    );
  });

  it('renders singular wording', () => {
    expect(summarizeBlast({ symbols: 1, callers: 1, endpoints: 1, crons: 1 })).toBe(
      '1 changed symbol · 1 caller · 1 endpoint · 1 cron/job',
    );
  });

  it('counts unique endpoints and crons across the whole downstream list', () => {
    const out = toBlastRadius(
      result({
        changedSymbols: [
          { name: 'a', file: 'src/ctx.ts', kind: 'function' },
          { name: 'b', file: 'src/ctx.ts', kind: 'function' },
        ],
        callers: [
          caller({ file: 'src/r.ts', viaSymbol: 'a' }),
          caller({ file: 'src/r.ts', viaSymbol: 'b', symbol: 'other' }),
        ],
        factsByFile: { 'src/r.ts': { endpoints: ['GET /same'], crons: ['@hourly'] } },
      }),
      LIMIT,
    );
    // Both symbols reach the same endpoint and cron: each is counted once.
    expect(out.summary).toBe('2 changed symbols · 2 callers · 1 endpoint · 1 cron/job');
  });

  it('summarises an empty result', () => {
    const out = toBlastRadius({ changedSymbols: [], callers: [], impactedEndpoints: [] }, LIMIT);
    expect(out).toEqual({
      changed_symbols: [],
      downstream: [],
      summary: '0 changed symbols · 0 callers · 0 endpoints · 0 crons/jobs',
    });
  });
});

describe('toBlastRadius — contract', () => {
  it('produces a value that parses as BlastRadius and, once marked, as PrBlastRadiusResponse', () => {
    const out = toBlastRadius(
      result({
        callers: [caller({ file: 'src/a.ts', viaSymbol: 'getContext', line: 5 })],
        factsByFile: { 'src/a.ts': { endpoints: ['GET /a'], crons: ['@daily'] } },
      }),
      LIMIT,
    );
    expect(() => BlastRadius.parse(out)).not.toThrow();
    const full = { ...out, degraded: false, degraded_reason: null, indexed_sha: 'abc123' };
    expect(PrBlastRadiusResponse.parse(full)).toEqual(full);
    // The response is a superset: it also parses as the base contract.
    expect(() => BlastRadius.parse(full)).not.toThrow();
  });

  it('rejects a response that lacks the degradation marker', () => {
    const out = toBlastRadius(result(), LIMIT);
    expect(PrBlastRadiusResponse.safeParse(out).success).toBe(false);
  });
});

describe('resolveDegradation — precedence', () => {
  const full = { status: 'full' as const };
  const partial = { status: 'partial' as const };

  it('flag off wins over everything', () => {
    expect(
      resolveDegradation({
        enabled: false,
        state: { status: 'failed', degradedReason: 'index_failed' },
        result: { degraded: true, reason: 'no_data' },
      }),
    ).toEqual({ degraded: true, degraded_reason: 'flag_off' });
  });

  it('an unusable index uses the state\'s own reason when it has one', () => {
    expect(
      resolveDegradation({
        enabled: true,
        state: { status: 'degraded', degradedReason: 'repo_too_large' },
      }),
    ).toEqual({ degraded: true, degraded_reason: 'repo_too_large' });
  });

  it('a failed index without a stated reason maps to index_failed', () => {
    expect(resolveDegradation({ enabled: true, state: { status: 'failed' } })).toEqual({
      degraded: true,
      degraded_reason: 'index_failed',
    });
  });

  it('a degraded index without a stated reason maps to no_data', () => {
    expect(resolveDegradation({ enabled: true, state: { status: 'degraded' } })).toEqual({
      degraded: true,
      degraded_reason: 'no_data',
    });
  });

  it('a usable index whose facade result is degraded passes the facade reason through', () => {
    expect(
      resolveDegradation({
        enabled: true,
        state: partial,
        result: { degraded: true, reason: 'repo_too_large' },
      }),
    ).toEqual({ degraded: true, degraded_reason: 'repo_too_large' });
  });

  it('a degraded facade result without a reason maps to no_data', () => {
    expect(
      resolveDegradation({ enabled: true, state: full, result: { degraded: true } }),
    ).toEqual({ degraded: true, degraded_reason: 'no_data' });
  });

  it('a partial index alone is reported as index_partial', () => {
    expect(
      resolveDegradation({ enabled: true, state: partial, result: { degraded: false } }),
    ).toEqual({ degraded: true, degraded_reason: 'index_partial' });
  });

  it('a full, healthy index is not degraded', () => {
    expect(
      resolveDegradation({ enabled: true, state: full, result: { degraded: false } }),
    ).toEqual({ degraded: false, degraded_reason: null });
  });
});
