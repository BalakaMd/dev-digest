import type { AgentEstimate } from "@devdigest/shared";

export interface SelectionSummary {
  /** Max duration of the checked agents that have one; null when none. */
  timeMs: number | null;
  /** Sum of the cost of the checked agents that have one; null when none. */
  costUsd: number | null;
  agentsWithoutTime: number;
  agentsWithoutCost: number;
  /** Checked agents missing at least one of the two estimates. */
  agentsWithoutHistory: number;
}

/** Totals over the checked agents (AC-14, AC-16, AC-53). Missing values are left out. */
export function summariseSelection(
  checkedIds: readonly string[],
  estimates: readonly AgentEstimate[],
): SelectionSummary {
  const byId = new Map(estimates.map((e) => [e.agent_id, e]));
  let timeMs: number | null = null;
  let costUsd: number | null = null;
  let withoutTime = 0;
  let withoutCost = 0;
  let withoutHistory = 0;
  for (const id of checkedIds) {
    const e = byId.get(id);
    const d = e?.duration_ms ?? null;
    const c = e?.cost_usd ?? null;
    if (d == null) withoutTime++;
    else timeMs = Math.max(timeMs ?? 0, d);
    if (c == null) withoutCost++;
    else costUsd = (costUsd ?? 0) + c;
    if (d == null || c == null) withoutHistory++;
  }
  return {
    timeMs,
    costUsd,
    agentsWithoutTime: withoutTime,
    agentsWithoutCost: withoutCost,
    agentsWithoutHistory: withoutHistory,
  };
}

/** Open PRs only: not merged/closed, and with an id to run against. */
export function openPulls<T extends { id?: string | null; status: string }>(
  pulls: readonly T[] | undefined,
): (T & { id: string })[] {
  return (pulls ?? []).filter(
    (p): p is T & { id: string } => !!p.id && p.status !== "merged" && p.status !== "closed",
  );
}
