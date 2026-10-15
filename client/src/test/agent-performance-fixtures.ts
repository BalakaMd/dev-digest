/* Test fixtures for the Agent Performance page (SPEC-10): builders for the two read responses.
   Not a test file (no `.test.` suffix) — vitest does not collect it. */
import type {
  AcceptStats,
  AgentPerformanceDetail,
  AgentPerformanceOverview,
  AgentPerformanceRow,
} from "@devdigest/shared";

/** Accept stats from the decisions; `rate` and `low_sample` derived like the API does (AC-13, AC-14). */
export function acceptOf(accepted: number, dismissed: number): AcceptStats {
  const decisions = accepted + dismissed;
  return {
    rate: decisions === 0 ? null : accepted / decisions,
    accepted,
    dismissed,
    decisions,
    low_sample: decisions >= 1 && decisions <= 9,
  };
}

export function rowOf(id: string, name: string, over: Partial<AgentPerformanceRow> = {}): AgentPerformanceRow {
  return {
    agent_id: id,
    name,
    enabled: true,
    runs: 10,
    failed: 1,
    avg_cost_usd: 0.04,
    avg_duration_ms: 6200,
    accept: acceptOf(45, 13),
    last_run_at: new Date(Date.now() - 5 * 60_000).toISOString(),
    cost_per_accepted_usd: 0.08,
    ...over,
  };
}

/** A row of an agent without a counted run in the range: zero counts, every other value null (AC-44). */
export function idleRowOf(id: string, name: string, over: Partial<AgentPerformanceRow> = {}): AgentPerformanceRow {
  return rowOf(id, name, {
    runs: 0,
    failed: 0,
    avg_cost_usd: null,
    avg_duration_ms: null,
    accept: acceptOf(0, 0),
    last_run_at: null,
    cost_per_accepted_usd: null,
    ...over,
  });
}

export const REPO = { id: "r1", full_name: "acme/web" };

export function overviewOf(over: Partial<AgentPerformanceOverview> = {}): AgentPerformanceOverview {
  const rows = over.rows ?? [rowOf("a1", "Security Reviewer", { runs: 142 }), rowOf("a2", "Style Reviewer", { runs: 87 })];
  return {
    repo: REPO,
    range: { from: "2026-09-14T10:00:00.000Z", to: "2026-10-14T10:00:00.000Z" },
    totals: {
      runs: 229,
      failed: 3,
      total_cost_usd: 8.74,
      not_priced_runs: 0,
      cost_by_source: { provider: 6.1, estimate: 2.64, mixed: 0, unknown: 0 },
      accept: acceptOf(61, 39),
      most_active: { agent_id: "a1", name: "Security Reviewer", runs: 142, accept: acceptOf(45, 13) },
    },
    previous_period: { total_cost_usd: 9.94, has_runs: true },
    buckets: [
      { start: "2026-09-14T10:00:00.000Z", runs: 100 },
      { start: "2026-09-15T10:00:00.000Z", runs: 129 },
    ],
    rows,
    cost_by_agent: [
      { agent_id: "a1", name: "Security Reviewer", cost_usd: 5.68 },
      { agent_id: "a2", name: "Style Reviewer", cost_usd: 3.06 },
    ],
    cost_by_model: [
      { model: "gpt-4.1", cost_usd: 6.1 },
      { model: "gpt-4o", cost_usd: 2.64 },
    ],
    ...over,
  };
}

/** A repository with agents but no counted run in the range (AC-42). */
export function emptyRangeOverviewOf(over: Partial<AgentPerformanceOverview> = {}): AgentPerformanceOverview {
  return overviewOf({
    totals: {
      runs: 0,
      failed: 0,
      total_cost_usd: 0,
      not_priced_runs: 0,
      cost_by_source: { provider: 0, estimate: 0, mixed: 0, unknown: 0 },
      accept: acceptOf(0, 0),
      most_active: null,
    },
    previous_period: { total_cost_usd: 0, has_runs: false },
    buckets: [{ start: "2026-09-14T10:00:00.000Z", runs: 0 }],
    rows: [idleRowOf("a1", "Security Reviewer"), idleRowOf("a2", "Style Reviewer")],
    cost_by_agent: [],
    cost_by_model: [],
    ...over,
  });
}

export function detailOf(row: AgentPerformanceRow, over: Partial<AgentPerformanceDetail> = {}): AgentPerformanceDetail {
  return {
    ...row,
    repo: REPO,
    range: { from: "2026-09-14T10:00:00.000Z", to: "2026-10-14T10:00:00.000Z" },
    cost_by_model: [
      { model: "gpt-4.1", cost_usd: 0.5 },
      { model: null, cost_usd: 0.25 },
    ],
    not_priced_runs: 0,
    cost_by_source: { provider: 0.5, estimate: 0.25, mixed: 0, unknown: 0 },
    undecided: 7,
    runs_by_source: { local: 8, ci: 2 },
    ...over,
  };
}
