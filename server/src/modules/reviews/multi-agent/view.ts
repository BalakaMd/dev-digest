/**
 * Pure assembly of the `MultiAgentRun` read model from persisted rows.
 */
import type { AgentColumn, MultiAgentRun, RunEstimate } from '@devdigest/shared';
import type { ReviewDtoFinding } from '../helpers.js';
import { buildConflicts } from './conflicts.js';
import { compareFindings, groupFindings } from './groups.js';

export interface MultiAgentRecordInput {
  id: string;
  prId: string;
  repoId: string;
  prNumber: number;
  prTitle: string;
  ranAt: Date;
  estimate: RunEstimate | null;
}

export interface MultiAgentEntryInput {
  runId: string;
  agentId: string | null;
  agentName: string | null;
  provider: string | null;
  model: string | null;
  status: string | null;
  error: string | null;
  durationMs: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  ranAt: Date;
  finishedAt: Date | null;
  review: { verdict: string | null; summary: string | null; score: number | null } | null;
  findings: ReviewDtoFinding[];
}

const STATUSES = ['running', 'done', 'failed', 'cancelled'] as const;

function toStatus(s: string | null): AgentColumn['status'] {
  return (STATUSES as readonly string[]).includes(s ?? '') ? (s as AgentColumn['status']) : 'failed';
}

function cmp(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function buildMultiAgentRun(
  record: MultiAgentRecordInput,
  entries: readonly MultiAgentEntryInput[],
  latestLogs: ReadonlyMap<string, string | null> = new Map(),
): MultiAgentRun {
  const columns: AgentColumn[] = entries.map((e) => {
    const status = toStatus(e.status);
    const findings = [...e.findings].sort(compareFindings);
    return {
      run_id: e.runId,
      agent_id: e.agentId,
      agent_name: e.agentName,
      provider: e.provider,
      model: e.model,
      status,
      error: e.error,
      verdict: e.review?.verdict ?? null,
      score: e.review?.score ?? null,
      summary: e.review?.summary ?? null,
      duration_ms: e.durationMs,
      tokens_in: e.tokensIn,
      tokens_out: e.tokensOut,
      cost_usd: e.costUsd,
      started_at: e.ranAt.toISOString(),
      latest_log: status === 'running' ? (latestLogs.get(e.runId) ?? null) : null,
      findings,
    };
  });

  columns.sort((a, b) => {
    if ((a.agent_name === null) !== (b.agent_name === null)) return a.agent_name === null ? 1 : -1;
    return (
      cmp((a.agent_name ?? '').toLowerCase(), (b.agent_name ?? '').toLowerCase()) ||
      cmp(a.run_id, b.run_id)
    );
  });

  const all = columns.flatMap((c) => c.findings.map((f) => ({ ...f, run_id: c.run_id })));
  const groups = groupFindings(all);
  const byId = new Map(all.map((f) => [f.id, f]));
  const conflicts = buildConflicts(columns, groups, byId);

  const anyRunning = columns.some((c) => c.status === 'running');
  const finishes = entries.filter((e) => e.finishedAt).map((e) => e.finishedAt!.getTime());
  const totalDuration =
    anyRunning || finishes.length === 0
      ? null
      : Math.max(0, Math.max(...finishes) - record.ranAt.getTime());
  const costs = columns.map((c) => c.cost_usd).filter((c): c is number => c !== null);

  return {
    id: record.id,
    pr_id: record.prId,
    repo_id: record.repoId,
    pr_number: record.prNumber,
    pr_title: record.prTitle,
    ran_at: record.ranAt.toISOString(),
    agent_count: columns.length,
    total_duration_ms: totalDuration,
    total_cost_usd: costs.length ? costs.reduce((s, c) => s + c, 0) : null,
    cost_incomplete: columns.some((c) => c.cost_usd === null),
    estimate: record.estimate,
    columns,
    groups,
    conflicts,
  };
}
