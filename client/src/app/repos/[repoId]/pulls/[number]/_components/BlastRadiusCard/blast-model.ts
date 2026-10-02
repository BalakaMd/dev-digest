/* blast-model.ts — pure, React-free derivations over the blast-radius response. */
import type { PrBlastRadiusResponse } from "@devdigest/shared";

export interface BlastCounts {
  symbols: number;
  callers: number;
  endpoints: number;
  crons: number;
}

/** Headline numbers; endpoints and crons are counted once even if several symbols reach them. */
export function blastCounts(res: PrBlastRadiusResponse): BlastCounts {
  const endpoints = new Set<string>();
  const crons = new Set<string>();
  let callers = 0;
  for (const d of res.downstream) {
    callers += d.callers.length;
    d.endpoints_affected.forEach((e) => endpoints.add(e));
    d.crons_affected.forEach((c) => crons.add(c));
  }
  return { symbols: res.changed_symbols.length, callers, endpoints: endpoints.size, crons: crons.size };
}

/** Changed symbol names that have no entry in `downstream` (no callers). */
export function symbolsWithoutCallers(res: PrBlastRadiusResponse): string[] {
  const withCallers = new Set(res.downstream.map((d) => d.symbol));
  return res.changed_symbols.map((c) => c.name).filter((name) => !withCallers.has(name));
}

/** Commit the caller line numbers refer to; falls back to the PR head. */
export function callerLinkSha(res: PrBlastRadiusResponse, headSha: string): string {
  return res.indexed_sha ?? headSha;
}
