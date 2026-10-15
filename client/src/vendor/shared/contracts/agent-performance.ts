import { z } from 'zod';

/**
 * SPEC-10 — Agent Performance: two read-only endpoints.
 *
 *   GET /agent-performance?repoId=&from=&to=       → AgentPerformanceOverview
 *   GET /agents/:id/performance?repoId=&from=&to=  → AgentPerformanceDetail
 *
 * Snake_case like eval-ci.ts. `from` is inclusive, `to` exclusive (ISO-8601 instants).
 */

const HOUR_MS = 3_600_000;
/** 366 days plus one hour (one daylight-saving shift). */
export const PERF_MAX_SPAN_MS = 366 * 24 * HOUR_MS + HOUR_MS;

export const PerfInstant = z.string().datetime({ offset: true });

export const AgentPerformanceQuery = z
  .object({
    repoId: z.string().uuid(),
    from: PerfInstant,
    to: PerfInstant,
  })
  .superRefine((q, ctx) => {
    const from = Date.parse(q.from);
    const to = Date.parse(q.to);
    if (Number.isNaN(from) || Number.isNaN(to)) return;
    if (from >= to) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['from'], message: '`from` must be before `to`' });
    } else if (to - from > PERF_MAX_SPAN_MS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['to'], message: 'Range is longer than 366 days' });
    }
  });
export type AgentPerformanceQuery = z.infer<typeof AgentPerformanceQuery>;

/** Accepted / dismissed decisions of local runs; `rate` is null when `decisions` is 0. */
export const AcceptStats = z.object({
  rate: z.number().nullable(),
  accepted: z.number().int(),
  dismissed: z.number().int(),
  /** accepted + dismissed */
  decisions: z.number().int(),
  /** 1 ≤ decisions ≤ 9 */
  low_sample: z.boolean(),
});
export type AcceptStats = z.infer<typeof AcceptStats>;

export const CostBySource = z.object({
  provider: z.number(),
  estimate: z.number(),
  mixed: z.number(),
  unknown: z.number(),
});
export type CostBySource = z.infer<typeof CostBySource>;

export const AgentPerformanceRow = z.object({
  agent_id: z.string(),
  name: z.string(),
  enabled: z.boolean(),
  runs: z.number().int(),
  failed: z.number().int(),
  avg_cost_usd: z.number().nullable(),
  avg_duration_ms: z.number().nullable(),
  accept: AcceptStats,
  last_run_at: z.string().nullable(),
  cost_per_accepted_usd: z.number().nullable(),
});
export type AgentPerformanceRow = z.infer<typeof AgentPerformanceRow>;

/** `agent_id`/`name` null = runs of a deleted agent. */
export const AgentCostSlice = z.object({
  agent_id: z.string().nullable(),
  name: z.string().nullable(),
  cost_usd: z.number(),
});
export type AgentCostSlice = z.infer<typeof AgentCostSlice>;

/** `model` null = unknown model. */
export const ModelCostSlice = z.object({
  model: z.string().nullable(),
  cost_usd: z.number(),
});
export type ModelCostSlice = z.infer<typeof ModelCostSlice>;

export const PerfRepoRef = z.object({ id: z.string(), full_name: z.string() });
export type PerfRepoRef = z.infer<typeof PerfRepoRef>;

export const PerfRange = z.object({ from: z.string(), to: z.string() });
export type PerfRange = z.infer<typeof PerfRange>;

export const PerfBucket = z.object({ start: z.string(), runs: z.number().int() });
export type PerfBucket = z.infer<typeof PerfBucket>;

export const AgentPerformanceOverview = z.object({
  repo: PerfRepoRef,
  range: PerfRange,
  totals: z.object({
    runs: z.number().int(),
    failed: z.number().int(),
    total_cost_usd: z.number(),
    not_priced_runs: z.number().int(),
    cost_by_source: CostBySource,
    accept: AcceptStats,
    most_active: z
      .object({
        agent_id: z.string(),
        name: z.string(),
        runs: z.number().int(),
        accept: AcceptStats,
      })
      .nullable(),
  }),
  previous_period: z.object({ total_cost_usd: z.number(), has_runs: z.boolean() }),
  buckets: z.array(PerfBucket),
  rows: z.array(AgentPerformanceRow),
  cost_by_agent: z.array(AgentCostSlice),
  cost_by_model: z.array(ModelCostSlice),
});
export type AgentPerformanceOverview = z.infer<typeof AgentPerformanceOverview>;

export const AgentPerformanceDetail = AgentPerformanceRow.extend({
  repo: PerfRepoRef,
  range: PerfRange,
  cost_by_model: z.array(ModelCostSlice),
  not_priced_runs: z.number().int(),
  cost_by_source: CostBySource,
  /** Findings of the agent's counted local runs with no decision. */
  undecided: z.number().int(),
  runs_by_source: z.object({ local: z.number().int(), ci: z.number().int() }),
});
export type AgentPerformanceDetail = z.infer<typeof AgentPerformanceDetail>;
