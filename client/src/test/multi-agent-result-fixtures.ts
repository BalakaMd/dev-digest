/* Test fixtures for the multi-agent result components (ColumnsView, TabsView,
   DisagreeBlock, ResultsView). Not a test file (no `.test.` suffix). */
import type { AgentColumn, Conflict, ConflictTake, FindingGroup, FindingRecord, MultiAgentRun } from "@devdigest/shared";

/** Untrusted markup that must only ever be shown as text. */
export const XSS = "<img src=x onerror=alert(1)>";

export function finding(id: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    review_id: "rev-1",
    severity: "WARNING",
    category: "bug",
    title: `Finding ${id}`,
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    rationale: `Rationale of ${id}`,
    suggestion: null,
    confidence: 0.8,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

export function column(runId: string, over: Partial<AgentColumn> = {}): AgentColumn {
  return {
    run_id: runId,
    agent_id: `agent-${runId}`,
    agent_name: `Agent ${runId}`,
    provider: "openrouter",
    model: "m",
    status: "done",
    error: null,
    verdict: null,
    score: 80,
    summary: `Summary of ${runId}`,
    duration_ms: 12_300,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0123,
    started_at: "2026-10-10T10:00:00.000Z",
    latest_log: null,
    findings: [],
    ...over,
  };
}

export function group(id: string, members: Array<[string, string]>, over: Partial<FindingGroup> = {}): FindingGroup {
  return {
    id,
    file: "src/a.ts",
    start_line: 10,
    end_line: 12,
    title: "Shared title",
    severity: "WARNING",
    members: members.map(([finding_id, run_id]) => ({ finding_id, run_id })),
    ...over,
  };
}

export function take(runId: string, over: Partial<ConflictTake> = {}): ConflictTake {
  return {
    run_id: runId,
    agent_id: `agent-${runId}`,
    agent_name: `Agent ${runId}`,
    state: "did_not_flag",
    severity: null,
    title: null,
    finding_id: null,
    more_count: 0,
    agent_summary: null,
    ...over,
  };
}

export function conflict(groupId: string, takes: ConflictTake[], over: Partial<Conflict> = {}): Conflict {
  return { group_id: groupId, file: "src/a.ts", line: 10, title: `Row ${groupId}`, is_conflict: true, takes, ...over };
}

export function multiRun(over: Partial<MultiAgentRun> = {}): MultiAgentRun {
  return {
    id: "mar-1",
    pr_id: "pr-1",
    repo_id: "repo-1",
    pr_number: 42,
    pr_title: "Add rate limiting",
    ran_at: "2026-10-10T10:00:00.000Z",
    agent_count: 2,
    total_duration_ms: 20_000,
    total_cost_usd: 0.05,
    cost_incomplete: false,
    estimate: null,
    columns: [column("r1"), column("r2")],
    groups: [],
    conflicts: [],
    ...over,
  };
}
