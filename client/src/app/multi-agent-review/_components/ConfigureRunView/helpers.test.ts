import { describe, it, expect } from "vitest";
import type { AgentEstimate } from "@devdigest/shared";
import { openPulls, summariseSelection } from "./helpers";

const est = (agent_id: string, duration_ms: number | null, cost_usd: number | null): AgentEstimate => ({
  agent_id,
  duration_ms,
  cost_usd,
  runs: duration_ms == null ? 0 : 3,
  cost_runs: cost_usd == null ? 0 : 3,
});

describe("summariseSelection (AC-14, AC-16, AC-53)", () => {
  it("time is the slowest checked agent (they run in parallel), cost is the sum", () => {
    const s = summariseSelection(["a", "b"], [est("a", 12_000, 0.02), est("b", 8_000, 0.015), est("c", 99_000, 9)]);
    expect(s.timeMs).toBe(12_000);
    expect(s.costUsd).toBeCloseTo(0.035);
    expect(s.agentsWithoutHistory).toBe(0);
  });

  it("an agent without history is left out of the totals and counted", () => {
    const s = summariseSelection(["a", "b", "ghost"], [est("a", 5_000, 0.01), est("b", null, null)]);
    expect(s.timeMs).toBe(5_000);
    expect(s.costUsd).toBeCloseTo(0.01);
    expect(s.agentsWithoutTime).toBe(2);
    expect(s.agentsWithoutCost).toBe(2);
    expect(s.agentsWithoutHistory).toBe(2);
  });

  it("an agent with a time but no cost still counts as lacking history", () => {
    const s = summariseSelection(["a"], [est("a", 4_000, null)]);
    expect(s).toMatchObject({ timeMs: 4_000, costUsd: null, agentsWithoutTime: 0, agentsWithoutCost: 1, agentsWithoutHistory: 1 });
  });

  it("is null for both totals when no checked agent has history, and for an empty selection", () => {
    expect(summariseSelection(["a"], [est("a", null, null)])).toMatchObject({ timeMs: null, costUsd: null });
    expect(summariseSelection([], [est("a", 1, 1)])).toMatchObject({ timeMs: null, costUsd: null, agentsWithoutHistory: 0 });
  });
});

describe("openPulls (AC-10)", () => {
  it("keeps open pull requests only, drops merged, closed and ones without an id", () => {
    const pulls = [
      { id: "1", status: "open" },
      { id: "2", status: "needs_review" },
      { id: "3", status: "reviewed" },
      { id: "4", status: "stale" },
      { id: "5", status: "merged" },
      { id: "6", status: "closed" },
      { id: null, status: "open" },
      { status: "open" },
    ];
    expect(openPulls(pulls).map((p) => p.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("copes with the list not being loaded yet", () => {
    expect(openPulls(undefined)).toEqual([]);
  });
});
