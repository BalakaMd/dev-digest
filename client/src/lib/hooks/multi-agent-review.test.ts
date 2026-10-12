import { describe, it, expect } from "vitest";
import type { AgentColumn, MultiAgentRun, RunStatus } from "@devdigest/shared";
import { MULTI_AGENT_POLL_MS, multiAgentRefetchInterval } from "./multi-agent-review";

function column(runId: string, status: RunStatus): AgentColumn {
  return {
    run_id: runId,
    agent_id: `agent-${runId}`,
    agent_name: `Agent ${runId}`,
    provider: "openrouter",
    model: "m",
    status,
    error: null,
    verdict: null,
    score: null,
    summary: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    started_at: "2026-10-11T10:00:00Z",
    latest_log: null,
    findings: [],
  };
}

function runWith(...statuses: RunStatus[]): MultiAgentRun {
  return {
    id: "m1",
    pr_id: "pr1",
    repo_id: "r1",
    pr_number: 7,
    pr_title: "t",
    ran_at: "2026-10-11T10:00:00Z",
    agent_count: statuses.length,
    total_duration_ms: null,
    total_cost_usd: null,
    cost_incomplete: false,
    estimate: null,
    columns: statuses.map((s, i) => column(String(i), s)),
    groups: [],
    conflicts: [],
  };
}

describe("multiAgentRefetchInterval (NFR-1, AC-33, AC-49)", () => {
  it("polls within the 5 s status budget while any column is running", () => {
    const interval = multiAgentRefetchInterval(runWith("done", "running", "failed"));
    expect(interval).toBe(MULTI_AGENT_POLL_MS);
    expect(interval).toBeLessThanOrEqual(5000);
  });

  it("stops polling once every column has ended", () => {
    expect(multiAgentRefetchInterval(runWith("done", "failed", "cancelled"))).toBe(false);
  });

  it("does not poll before the first response", () => {
    expect(multiAgentRefetchInterval(undefined)).toBe(false);
  });
});
