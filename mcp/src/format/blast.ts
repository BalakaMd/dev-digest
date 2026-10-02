import type { PrBlastRadiusResponse } from '@devdigest/shared';
import { BLAST_REASON_TEXT, OUTPUT_BUDGET_CHARS } from '../constants.js';

export interface BlastProjection {
  summary: string;
  changedCount: number;
  degraded: boolean;
  degradedReason: PrBlastRadiusResponse['degraded_reason'];
  indexedSha: string | null;
  /** `detailed` adds the caller function name and the indexed sha. */
  detailed: boolean;
  downstream: {
    symbol: string;
    totalCallers: number;
    callers: { name: string; file: string; line: number }[];
    endpoints: string[];
    crons: string[];
  }[];
}

export function projectBlast(res: PrBlastRadiusResponse, opts: { detailed: boolean }): BlastProjection {
  return {
    summary: res.summary,
    changedCount: res.changed_symbols.length,
    degraded: res.degraded,
    degradedReason: res.degraded_reason,
    indexedSha: res.indexed_sha,
    detailed: opts.detailed,
    downstream: res.downstream.map((d) => ({
      symbol: d.symbol,
      totalCallers: d.callers.length,
      callers: d.callers,
      endpoints: d.endpoints_affected,
      crons: d.crons_affected,
    })),
  };
}

const SYNC_HINT =
  'Open this PR once in the DevDigest studio so its files are synced, or re-sync the repo (POST /repos/:id/resync), then retry.';

export function renderBlastText(p: BlastProjection, prLabel: string): string {
  const lines: string[] = [`Blast radius of ${prLabel} — ${p.summary}`];

  if (p.degraded) {
    const reason = p.degradedReason;
    const hint = reason ? BLAST_REASON_TEXT[reason] : 'the index is not usable';
    lines.push(`Index incomplete (${reason ?? 'unknown'}): ${hint}. ${SYNC_HINT}`);
  }

  if (p.downstream.length === 0) {
    lines.push(`No downstream callers found for ${p.changedCount} changed symbol(s).`);
    if (p.changedCount === 0 && !p.degraded) {
      lines.push(`No changed symbols were found. ${SYNC_HINT}`);
    }
  }

  if (p.detailed && p.indexedSha) lines.push(`Indexed at ${p.indexedSha} (caller line numbers refer to this commit).`);

  for (const d of p.downstream) {
    lines.push(`${d.symbol} — ${d.totalCallers} ${d.totalCallers === 1 ? 'caller' : 'callers'}`);
    // Every caller the API returned is listed, in both modes (same map as the UI).
    for (const c of d.callers) {
      lines.push(p.detailed ? `  ← ${c.file}:${c.line} (${c.name})` : `  ← ${c.file}:${c.line}`);
    }
    if (d.endpoints.length > 0) lines.push(`  endpoints: ${d.endpoints.join(', ')}`);
    if (d.crons.length > 0) lines.push(`  crons/jobs: ${d.crons.join(', ')}`);
  }

  const text = lines.join('\n');
  if (text.length <= OUTPUT_BUDGET_CHARS) return text;
  const note = '\n… output truncated to fit the size budget.';
  return text.slice(0, OUTPUT_BUDGET_CHARS - note.length) + note;
}
