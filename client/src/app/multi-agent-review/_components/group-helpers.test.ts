import { describe, it, expect } from "vitest";
import type { AgentColumn, FindingGroup } from "@devdigest/shared";
import { alsoFlaggedBy } from "./group-helpers";

const UNKNOWN = "Unknown agent";

function col(runId: string, name: string | null): AgentColumn {
  return {
    run_id: runId,
    agent_id: name ? `id-${runId}` : null,
    agent_name: name,
    provider: null,
    model: null,
    status: "done",
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

function group(id: string, members: [findingId: string, runId: string][]): FindingGroup {
  return {
    id,
    file: "src/a.ts",
    start_line: 1,
    end_line: 5,
    title: "t",
    severity: "WARNING",
    members: members.map(([finding_id, run_id]) => ({ finding_id, run_id })),
  };
}

const COLUMNS = [col("r1", "Security"), col("r2", "Style"), col("r3", "Perf"), col("r4", null)];

describe("alsoFlaggedBy (AC-57)", () => {
  it("names the other agents of the finding's group, in group order", () => {
    const groups = [group("g", [["f1", "r1"], ["f2", "r3"], ["f3", "r2"]])];
    expect(alsoFlaggedBy("f1", groups, COLUMNS, UNKNOWN)).toEqual(["Perf", "Style"]);
    expect(alsoFlaggedBy("f3", groups, COLUMNS, UNKNOWN)).toEqual(["Security", "Perf"]);
  });

  it("is empty when the finding is alone in its group", () => {
    expect(alsoFlaggedBy("f1", [group("g", [["f1", "r1"]])], COLUMNS, UNKNOWN)).toEqual([]);
  });

  it("is empty when the finding is in no group", () => {
    const groups = [group("g", [["f1", "r1"], ["f2", "r2"]])];
    expect(alsoFlaggedBy("nope", groups, COLUMNS, UNKNOWN)).toEqual([]);
  });

  it("does not list the same agent twice nor the finding's own agent", () => {
    const groups = [group("g", [["f1", "r1"], ["f2", "r1"], ["f3", "r2"], ["f4", "r2"]])];
    expect(alsoFlaggedBy("f1", groups, COLUMNS, UNKNOWN)).toEqual(["Style"]);
  });

  it("falls back to the given name for an agent without a name or without a column", () => {
    const groups = [group("g", [["f1", "r1"], ["f2", "r4"], ["f3", "gone"]])];
    expect(alsoFlaggedBy("f1", groups, COLUMNS, UNKNOWN)).toEqual([UNKNOWN]);
    expect(alsoFlaggedBy("f1", groups, COLUMNS, "Inconnu")).toEqual(["Inconnu"]);
  });
});
