/**
 * Pure run-time / cost estimates from the recent history of each agent.
 */
import type { AgentEstimate, RunEstimate } from '@devdigest/shared';

export interface EstimateSamples {
  agent_id: string;
  /** Newest-first durations (ms) of completed runs. */
  durations: number[];
  /** Newest-first costs (USD) of completed, priced runs. */
  costs: number[];
}

/** Median; even count -> mean of the two middle values. Empty -> null. */
export function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

export function toAgentEstimate(samples: EstimateSamples): AgentEstimate {
  const d = median(samples.durations);
  return {
    agent_id: samples.agent_id,
    duration_ms: d === null ? null : Math.round(d),
    cost_usd: median(samples.costs),
    runs: samples.durations.length,
    cost_runs: samples.costs.length,
  };
}

/** Time = slowest known agent (they run concurrently); cost = sum of known costs. */
export function summariseEstimate(
  estimates: readonly AgentEstimate[],
  agentIds: readonly string[],
): RunEstimate {
  const byId = new Map(estimates.map((e) => [e.agent_id, e]));
  let time: number | null = null;
  let cost: number | null = null;
  let withoutTime = 0;
  let withoutCost = 0;
  for (const id of agentIds) {
    const e = byId.get(id);
    if (e?.duration_ms == null) withoutTime++;
    else time = time === null ? e.duration_ms : Math.max(time, e.duration_ms);
    if (e?.cost_usd == null) withoutCost++;
    else cost = (cost ?? 0) + e.cost_usd;
  }
  return { time_ms: time, cost_usd: cost, agents_without_time: withoutTime, agents_without_cost: withoutCost };
}
