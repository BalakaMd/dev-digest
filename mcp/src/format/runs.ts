import type { RunSummary } from '@devdigest/shared';

export interface RunProjection {
  run_id: string;
  agent: string;
  status: string;
  score: number | null;
  verdict: string | null;
  counts: { critical: number; warning: number; suggestion: number };
  blockers: number | null;
  cost_usd: number | null;
  duration_s: number | null;
  error?: string;
}

/** A failed run with no error text (boot-reaper case, `run.repo.ts:105-111`). */
const NO_ERROR_RECORDED = 'failed (no error recorded — the API may have restarted)';

export function projectRun(run: RunSummary, verdictByRunId: Map<string, string | null>): RunProjection {
  const base: RunProjection = {
    run_id: run.run_id,
    agent: run.agent_name ?? 'unknown',
    status: run.status ?? 'unknown',
    score: run.score,
    verdict: verdictByRunId.get(run.run_id) ?? null,
    counts: { critical: 0, warning: 0, suggestion: 0 }, // filled by the caller from findings
    blockers: run.blockers,
    cost_usd: run.cost_usd,
    duration_s: run.duration_ms != null ? Math.round(run.duration_ms / 1000) : null,
  };
  if (run.status === 'failed') {
    base.error = run.error && run.error.length > 0 ? truncate(run.error, 200) : NO_ERROR_RECORDED;
  }
  return base;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

export function renderRunsText(runs: RunProjection[]): string {
  return runs
    .map((r) => {
      const parts = [
        r.agent,
        r.status,
        r.score != null ? `score ${r.score}` : null,
        r.cost_usd != null ? `$${r.cost_usd.toFixed(4)}` : null,
        r.error ? `error: ${r.error}` : null,
      ].filter(Boolean);
      return `${r.run_id.slice(0, 8)} — ${parts.join(' · ')}`;
    })
    .join('\n');
}
