import type {
  AcceptStats,
  AgentCostSlice,
  AgentPerformanceDetail,
  AgentPerformanceOverview,
  AgentPerformanceRow,
  CostBySource,
  ModelCostSlice,
  PerfBucket,
} from '@devdigest/shared';
import { COUNTED_STATUSES, DAY_MS, HOUR_MS, MIN_DECISIONS } from './constants.js';
import type { AgentRef, DecisionCount, LastRun, RepoRef, RunFact, TimeRange } from './types.js';

/**
 * Pure aggregation of the Agent Performance reads (SPEC-10 AC-7..AC-18, AC-53..AC-58).
 * No IO and no Drizzle: both reads call `buildAgentStats`, so a row of the overview and
 * the per-agent read always agree (AC-21). Rounding is left to the client (NFR-4).
 */

const COUNTED = new Set<string>(COUNTED_STATUSES);

export const isCounted = (r: RunFact): boolean => r.status != null && COUNTED.has(r.status);

/** Code-point comparison (never locale-dependent, NFR-4). */
const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);
const cmpName = (a: string, b: string): number => cmp(a.toLowerCase(), b.toLowerCase()) || cmp(a, b);

const mean = (xs: number[]): number | null =>
  xs.length === 0 ? null : xs.reduce((s, x) => s + x, 0) / xs.length;

const sum = (xs: number[]): number => xs.reduce((s, x) => s + x, 0);

export const emptyCostBySource = (): CostBySource => ({ provider: 0, estimate: 0, mixed: 0, unknown: 0 });

export function acceptStats(accepted: number, dismissed: number): AcceptStats {
  const decisions = accepted + dismissed;
  return {
    rate: decisions === 0 ? null : accepted / decisions,
    accepted,
    dismissed,
    decisions,
    low_sample: decisions >= 1 && decisions < MIN_DECISIONS,
  };
}

/** Totals over a set of counted runs: cost, cost split by source, not-priced count. */
function costTotals(runs: RunFact[]) {
  const bySource = emptyCostBySource();
  let total = 0;
  let notPriced = 0;
  for (const r of runs) {
    if (r.costUsd == null) {
      notPriced += 1;
      continue;
    }
    total += r.costUsd;
    bySource[r.costSource ?? 'unknown'] += r.costUsd;
  }
  return { total, bySource, notPriced };
}

const cmpAmount = (a: number, b: number): number => b - a;

function modelSlices(runs: RunFact[]): ModelCostSlice[] {
  const byModel = new Map<string | null, number>();
  for (const r of runs) {
    if (r.costUsd == null) continue;
    byModel.set(r.model ?? null, (byModel.get(r.model ?? null) ?? 0) + r.costUsd);
  }
  return [...byModel.entries()]
    .map(([model, cost_usd]) => ({ model, cost_usd }))
    .sort(
      (a, b) =>
        cmpAmount(a.cost_usd, b.cost_usd) ||
        (a.model === b.model ? 0 : a.model == null ? 1 : b.model == null ? -1 : cmp(a.model, b.model)),
    );
}

interface AcceptTally {
  accepted: number;
  dismissed: number;
  undecided: number;
}

/** Decisions of the counted LOCAL runs only (CI runs contribute no findings, AC-13). */
function tally(runs: RunFact[], decisions: Map<string, DecisionCount>): AcceptTally {
  const t = { accepted: 0, dismissed: 0, undecided: 0 };
  for (const r of runs) {
    if (r.source !== 'local') continue;
    const d = decisions.get(r.id);
    if (!d) continue;
    t.accepted += d.accepted;
    t.dismissed += d.dismissed;
    t.undecided += d.undecided;
  }
  return t;
}

export interface AgentStats {
  row: AgentPerformanceRow;
  costBySource: CostBySource;
  costByModel: ModelCostSlice[];
  notPriced: number;
  undecided: number;
  runsBySource: { local: number; ci: number };
}

/** The single implementation of one agent's numbers; `runs` may include uncounted runs. */
export function buildAgentStats(
  agent: AgentRef,
  runs: RunFact[],
  decisions: Map<string, DecisionCount>,
  lastRunAt: Date | null,
): AgentStats {
  const counted = runs.filter(isCounted);
  const done = counted.filter((r) => r.status === 'done');
  const t = tally(counted, decisions);
  const accept = acceptStats(t.accepted, t.dismissed);
  const { bySource, notPriced } = costTotals(counted);

  const localCosts = counted.filter((r) => r.source === 'local' && r.costUsd != null).map((r) => r.costUsd as number);
  const costPerAccepted = t.accepted === 0 || localCosts.length === 0 ? null : sum(localCosts) / t.accepted;

  return {
    row: {
      agent_id: agent.id,
      name: agent.name,
      enabled: agent.enabled,
      runs: counted.length,
      failed: counted.filter((r) => r.status === 'failed').length,
      avg_cost_usd: mean(done.filter((r) => r.costUsd != null).map((r) => r.costUsd as number)),
      avg_duration_ms: mean(done.filter((r) => r.durationMs != null).map((r) => r.durationMs as number)),
      accept,
      last_run_at: lastRunAt ? lastRunAt.toISOString() : null,
      cost_per_accepted_usd: costPerAccepted,
    },
    costBySource: bySource,
    costByModel: modelSlices(counted),
    notPriced,
    undecided: t.undecided,
    runsBySource: {
      local: counted.filter((r) => r.source === 'local').length,
      ci: counted.filter((r) => r.source === 'ci').length,
    },
  };
}

/** Buckets that start at `from` (AC-56): hourly for spans up to 24 h, else 24-hour; the last ends at `to`. */
export function buildBuckets(range: TimeRange, counted: RunFact[]): PerfBucket[] {
  const from = range.from.getTime();
  const span = range.to.getTime() - from;
  const size = span <= DAY_MS ? HOUR_MS : DAY_MS;
  const n = Math.max(1, Math.ceil(span / size));
  const counts = new Array<number>(n).fill(0);
  for (const r of counted) {
    const t = r.ranAt.getTime();
    if (t < from || t >= range.to.getTime()) continue;
    const i = Math.min(n - 1, Math.floor((t - from) / size));
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts.map((runs, i) => ({ start: new Date(from + i * size).toISOString(), runs }));
}

export interface OverviewInput {
  repo: RepoRef;
  range: TimeRange;
  agents: AgentRef[];
  /** Run facts in `range` (any status). */
  runs: RunFact[];
  /** Run facts in the previous period (any status). */
  previousRuns: RunFact[];
  decisions: DecisionCount[];
  lastRuns: LastRun[];
}

const decisionMap = (ds: DecisionCount[]) => new Map(ds.map((d) => [d.runId, d]));
const lastRunMap = (ls: LastRun[]) => new Map(ls.map((l) => [l.agentId, l.at]));

export function buildOverview(input: OverviewInput): AgentPerformanceOverview {
  const { repo, range } = input;
  const decisions = decisionMap(input.decisions);
  const lastRuns = lastRunMap(input.lastRuns);
  const counted = input.runs.filter(isCounted);

  const byAgent = new Map<string, RunFact[]>();
  const orphan: RunFact[] = []; // runs of deleted agents (AC-53)
  const known = new Set(input.agents.map((a) => a.id));
  for (const r of counted) {
    if (r.agentId == null || !known.has(r.agentId)) {
      orphan.push(r);
      continue;
    }
    const list = byAgent.get(r.agentId) ?? [];
    list.push(r);
    byAgent.set(r.agentId, list);
  }

  // Listed agents (AC-55): enabled, plus disabled ones with a counted run.
  const listed = input.agents
    .filter((a) => a.enabled || (byAgent.get(a.id)?.length ?? 0) > 0)
    .sort((a, b) => cmpName(a.name, b.name) || cmp(a.id, b.id));
  const stats = listed.map((a) => ({
    agent: a,
    runs: byAgent.get(a.id) ?? [],
    s: buildAgentStats(a, byAgent.get(a.id) ?? [], decisions, lastRuns.get(a.id) ?? null),
  }));

  const { total, bySource, notPriced } = costTotals(counted);
  const pooled = tally(counted, decisions);

  // Most-active (AC-17): runs, then latest last run, then name.
  let mostActive: AgentPerformanceOverview['totals']['most_active'] = null;
  const active = stats.filter((x) => x.s.row.runs > 0);
  if (active.length > 0) {
    const best = [...active].sort(
      (a, b) =>
        b.s.row.runs - a.s.row.runs ||
        cmp(b.s.row.last_run_at ?? '', a.s.row.last_run_at ?? '') ||
        cmpName(a.agent.name, b.agent.name) ||
        cmp(a.agent.id, b.agent.id),
    )[0]!;
    mostActive = {
      agent_id: best.agent.id,
      name: best.agent.name,
      runs: best.s.row.runs,
      accept: best.s.row.accept,
    };
  }

  // Cost by agent (AC-18, AC-53): one slice per agent with a priced run, "deleted agent" last.
  const agentSlices: AgentCostSlice[] = stats
    .filter((x) => x.runs.some((r) => r.costUsd != null))
    .map((x) => ({
      agent_id: x.agent.id as string | null,
      name: x.agent.name as string | null,
      cost_usd: sum(x.runs.filter((r) => r.costUsd != null).map((r) => r.costUsd as number)),
    }));
  if (orphan.some((r) => r.costUsd != null)) {
    agentSlices.push({
      agent_id: null,
      name: null,
      cost_usd: sum(orphan.filter((r) => r.costUsd != null).map((r) => r.costUsd as number)),
    });
  }
  agentSlices.sort(
    (a, b) =>
      cmpAmount(a.cost_usd, b.cost_usd) ||
      (a.agent_id == null ? 1 : b.agent_id == null ? -1 : cmpName(a.name ?? '', b.name ?? '') || cmp(a.agent_id, b.agent_id)),
  );

  const prevCounted = input.previousRuns.filter(isCounted);

  return {
    repo: { id: repo.id, full_name: repo.fullName },
    range: { from: range.from.toISOString(), to: range.to.toISOString() },
    totals: {
      runs: counted.length,
      failed: counted.filter((r) => r.status === 'failed').length,
      total_cost_usd: total,
      not_priced_runs: notPriced,
      cost_by_source: bySource,
      accept: acceptStats(pooled.accepted, pooled.dismissed),
      most_active: mostActive,
    },
    previous_period: { total_cost_usd: costTotals(prevCounted).total, has_runs: prevCounted.length > 0 },
    buckets: buildBuckets(range, counted),
    rows: stats.map((x) => x.s.row),
    cost_by_agent: agentSlices,
    cost_by_model: modelSlices(counted),
  };
}

export interface DetailInput {
  repo: RepoRef;
  range: TimeRange;
  agent: AgentRef;
  /** The agent's run facts in `range` (any status). */
  runs: RunFact[];
  decisions: DecisionCount[];
  lastRunAt: Date | null;
}

export function buildDetail(input: DetailInput): AgentPerformanceDetail {
  const s = buildAgentStats(input.agent, input.runs, decisionMap(input.decisions), input.lastRunAt);
  return {
    ...s.row,
    repo: { id: input.repo.id, full_name: input.repo.fullName },
    range: { from: input.range.from.toISOString(), to: input.range.to.toISOString() },
    cost_by_model: s.costByModel,
    not_priced_runs: s.notPriced,
    cost_by_source: s.costBySource,
    undecided: s.undecided,
    runs_by_source: s.runsBySource,
  };
}
