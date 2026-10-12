import { z } from 'zod';
import { Severity } from './findings.js';
import { FindingRecord } from './review-api.js';

/**
 * A5 — Observability / Multi-agent contracts (L07).
 *
 * These are NEW contracts (A5 owns this file; the barrel re-exports it). They
 * sit alongside A2's `review-api.ts`:
 *   - MultiAgentRun        the response of GET /multi-agent-runs/:id
 *   - AgentColumn          one agent's column in the multi-agent view
 *   - Conflict / ConflictTake  where agents disagree on the same file:line
 *   - AgentStats           per-agent quality aggregates (GET /agents/:id/stats)
 *   - CuratorResult        the cross-session memory curator outcome
 *
 * The single-document run trace itself stays in `contracts/trace.ts` (RunTrace).
 */

// ---------------------------------------------------------------------------
// Multi-Agent Review
// ---------------------------------------------------------------------------

export const RunStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type RunStatus = z.infer<typeof RunStatus>;

/** One agent's result column in the multi-agent review. */
export const AgentColumn = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  provider: z.string().nullable(),
  model: z.string().nullable(),
  status: RunStatus,
  error: z.string().nullable(),
  verdict: z.string().nullable(),
  score: z.number().int().nullable(),
  summary: z.string().nullable(),
  duration_ms: z.number().int().nullable(),
  tokens_in: z.number().int().nullable(),
  tokens_out: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  started_at: z.string(),
  latest_log: z.string().nullable(),
  findings: z.array(FindingRecord),
});
export type AgentColumn = z.infer<typeof AgentColumn>;

/** Findings of different agents on the same file and line range. */
export const FindingGroup = z.object({
  /** `${file}:${start_line}-${end_line}` */
  id: z.string(),
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  title: z.string(),
  severity: Severity,
  members: z.array(z.object({ finding_id: z.string(), run_id: z.string() })),
});
export type FindingGroup = z.infer<typeof FindingGroup>;

/** One agent's cell in a conflict row. */
export const ConflictTake = z.object({
  run_id: z.string(),
  agent_id: z.string().nullable(),
  agent_name: z.string().nullable(),
  state: z.enum(['flagged', 'did_not_flag', 'running', 'failed', 'cancelled']),
  severity: Severity.nullable(),
  title: z.string().nullable(),
  finding_id: z.string().nullable(),
  more_count: z.number().int(),
  agent_summary: z.string().nullable(),
});
export type ConflictTake = z.infer<typeof ConflictTake>;

/** One row of the disagreement block. Computed from persisted findings; not stored. */
export const Conflict = z.object({
  group_id: z.string(),
  file: z.string(),
  line: z.number().int(),
  title: z.string(),
  is_conflict: z.boolean(),
  takes: z.array(ConflictTake),
});
export type Conflict = z.infer<typeof Conflict>;

/** Pre-run estimate stored on the multi-agent run. */
export const RunEstimate = z.object({
  time_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  agents_without_time: z.number().int(),
  agents_without_cost: z.number().int(),
});
export type RunEstimate = z.infer<typeof RunEstimate>;

/** Per-agent estimate (GET /review-estimates). */
export const AgentEstimate = z.object({
  agent_id: z.string(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  /** Number of runs the duration is based on. */
  runs: z.number().int(),
  /** Number of priced runs the cost is based on. */
  cost_runs: z.number().int(),
});
export type AgentEstimate = z.infer<typeof AgentEstimate>;

export const ReviewEstimates = z.object({ estimates: z.array(AgentEstimate) });
export type ReviewEstimates = z.infer<typeof ReviewEstimates>;

/** Response of GET /multi-agent-runs/:id. */
export const MultiAgentRun = z.object({
  id: z.string(),
  pr_id: z.string(),
  repo_id: z.string(),
  pr_number: z.number().int(),
  pr_title: z.string(),
  ran_at: z.string(),
  agent_count: z.number().int(),
  total_duration_ms: z.number().int().nullable(),
  total_cost_usd: z.number().nullable(),
  cost_incomplete: z.boolean(),
  estimate: RunEstimate.nullable(),
  columns: z.array(AgentColumn),
  groups: z.array(FindingGroup),
  conflicts: z.array(Conflict),
});
export type MultiAgentRun = z.infer<typeof MultiAgentRun>;

/** Response of GET /pulls/:id/multi-agent-runs/latest. */
export const LatestMultiAgentRun = z.object({
  latest: z.object({ id: z.string(), ran_at: z.string() }).nullable(),
});
export type LatestMultiAgentRun = z.infer<typeof LatestMultiAgentRun>;

// ---------------------------------------------------------------------------
// Per-agent Stats (GET /agents/:id/stats)
// ---------------------------------------------------------------------------

/** A single (date, value) point for a sparkline/trend. */
export const StatPoint = z.object({ label: z.string(), value: z.number() });
export type StatPoint = z.infer<typeof StatPoint>;

export const AgentStats = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  runs: z.number().int(),
  findings_total: z.number().int(),
  /** accept-rate is the headline quality signal. 0..1 over acted findings. */
  accepted: z.number().int(),
  dismissed: z.number().int(),
  pending: z.number().int(),
  accept_rate: z.number().nullable(),
  dismiss_rate: z.number().nullable(),
  avg_findings_per_run: z.number().nullable(),
  total_cost_usd: z.number().nullable(),
  avg_cost_usd: z.number().nullable(),
  avg_latency_ms: z.number().nullable(),
  findings_by_severity: z.object({
    CRITICAL: z.number().int(),
    WARNING: z.number().int(),
    SUGGESTION: z.number().int(),
  }),
  /** recent runs for a small trend chart (oldest→newest). */
  trend: z.array(StatPoint),
});
export type AgentStats = z.infer<typeof AgentStats>;

// ---------------------------------------------------------------------------
// Cross-session memory curator
// ---------------------------------------------------------------------------

/** A merge the curator performed (or would perform in dry-run). */
export const CuratorMerge = z.object({
  kept_id: z.string(),
  merged_ids: z.array(z.string()),
  content: z.string(),
  similarity: z.number(),
});
export type CuratorMerge = z.infer<typeof CuratorMerge>;

export const CuratorResult = z.object({
  scanned: z.number().int(),
  merges: z.array(CuratorMerge),
  removed: z.number().int(),
  dry_run: z.boolean(),
});
export type CuratorResult = z.infer<typeof CuratorResult>;
