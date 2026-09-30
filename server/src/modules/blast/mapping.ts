import type { BlastDegradedReason, BlastRadius } from '@devdigest/shared';
import type { BlastResult, DegradedReason, IndexState } from '../repo-intel/types.js';

// Compile-time guard: the contract enum and the repo-intel type must not drift.
type _SameReasons = [BlastDegradedReason] extends [DegradedReason]
  ? [DegradedReason] extends [BlastDegradedReason]
    ? true
    : never
  : never;
const _reasonsInSync: _SameReasons = true;
void _reasonsInSync;

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Plain-English one-liner, e.g. `2 changed symbols · 14 callers · 3 endpoints · 1 cron/job`. */
export function summarizeBlast(c: BlastCounts): string {
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return [
    plural(c.symbols, 'changed symbol', 'changed symbols'),
    plural(c.callers, 'caller', 'callers'),
    plural(c.endpoints, 'endpoint', 'endpoints'),
    plural(c.crons, 'cron/job', 'crons/jobs'),
  ].join(' · ');
}

/** Flat facade result → grouped contract shape. Pure; ordering is decided here. */
export function toBlastRadius(
  result: BlastResult,
  opts: { maxCallersPerSymbol: number },
): BlastRadius {
  const changed_symbols = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));
  const declaredIn = new Set(result.changedSymbols.map((s) => `${s.name}|${s.file}`));
  const factsSource = result.reachableFactsByFile ?? result.factsByFile;

  const groups = new Map<string, BlastResult['callers']>();
  const seen = new Set<string>();
  for (const c of result.callers) {
    if (declaredIn.has(`${c.viaSymbol}|${c.file}`)) continue;
    const key = `${c.viaSymbol}|${c.file}|${c.symbol}|${c.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const arr = groups.get(c.viaSymbol);
    if (arr) arr.push(c);
    else groups.set(c.viaSymbol, [c]);
  }

  const impacts = [...groups.entries()].map(([symbol, rows]) => {
    const kept = [...rows]
      .sort((a, b) => b.rank - a.rank || a.file.localeCompare(b.file) || a.line - b.line)
      .slice(0, opts.maxCallersPerSymbol);
    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const c of kept) {
      const f = factsSource?.[c.file];
      if (!f) continue;
      for (const e of f.endpoints) endpoints.add(e);
      for (const cr of f.crons) crons.add(cr);
    }
    return {
      maxRank: kept.length > 0 ? kept[0]!.rank : 0,
      impact: {
        symbol,
        callers: kept.map((c) => ({ name: c.symbol, file: c.file, line: c.line })),
        endpoints_affected: [...endpoints],
        crons_affected: [...crons],
      },
    };
  });

  impacts.sort(
    (a, b) =>
      b.maxRank - a.maxRank ||
      b.impact.callers.length - a.impact.callers.length ||
      a.impact.symbol.localeCompare(b.impact.symbol),
  );
  const downstream = impacts.map((i) => i.impact);

  const allEndpoints = new Set(downstream.flatMap((d) => d.endpoints_affected));
  const allCrons = new Set(downstream.flatMap((d) => d.crons_affected));
  const summary = summarizeBlast({
    symbols: changed_symbols.length,
    callers: downstream.reduce((n, d) => n + d.callers.length, 0),
    endpoints: allEndpoints.size,
    crons: allCrons.size,
  });
  return { changed_symbols, downstream, summary };
}

/** Which degradation marker (if any) the response carries. See precedence in the plan. */
export function resolveDegradation(input: {
  enabled: boolean;
  state: Pick<IndexState, 'status' | 'degradedReason'>;
  result?: Pick<BlastResult, 'degraded' | 'reason'>;
}): { degraded: boolean; degraded_reason: BlastDegradedReason | null } {
  const { enabled, state, result } = input;
  if (!enabled) return { degraded: true, degraded_reason: 'flag_off' };
  if (state.status !== 'full' && state.status !== 'partial') {
    return {
      degraded: true,
      degraded_reason:
        state.degradedReason ?? (state.status === 'failed' ? 'index_failed' : 'no_data'),
    };
  }
  if (result?.degraded) return { degraded: true, degraded_reason: result.reason ?? 'no_data' };
  if (state.status === 'partial') return { degraded: true, degraded_reason: 'index_partial' };
  return { degraded: false, degraded_reason: null };
}
