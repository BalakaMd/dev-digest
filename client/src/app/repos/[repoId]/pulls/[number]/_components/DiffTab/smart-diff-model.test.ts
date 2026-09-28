import { describe, it, expect } from "vitest";
import type { FindingRecord, PrFile, ReviewRecord, SmartDiffResponse } from "@devdigest/shared";
import {
  buildRoleGroups,
  countFilesWithFindings,
  findingAnchorKey,
  findingsByFile,
  groupFindingsByAnchor,
  latestReviewPerAgent,
  mostSevereFinding,
} from "./smart-diff-model";

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function review(o: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: "r1",
    pr_id: "pr1",
    agent_id: "agent-a",
    run_id: null,
    agent_name: "Agent A",
    kind: "review",
    verdict: null,
    summary: null,
    score: null,
    model: null,
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [],
    ...o,
  } as ReviewRecord;
}

function prFile(path: string, o: Partial<PrFile> = {}): PrFile {
  return { path, additions: 1, deletions: 0, patch: null, ...o };
}

describe("latestReviewPerAgent (D2 — mirrors the server rule)", () => {
  it("keeps only the newest review per agent, from a newest-first list", () => {
    const newest = review({ id: "r-new", agent_id: "agent-a", created_at: "2026-01-02T00:00:00Z" });
    const older = review({ id: "r-old", agent_id: "agent-a", created_at: "2026-01-01T00:00:00Z" });
    const otherAgent = review({ id: "r-b", agent_id: "agent-b", created_at: "2026-01-01T12:00:00Z" });
    const result = latestReviewPerAgent([newest, otherAgent, older]);
    expect(result.map((r) => r.id)).toEqual(["r-new", "r-b"]);
  });

  it("excludes summary rows — only kind 'review' counts", () => {
    const summary = review({ id: "s1", kind: "summary", agent_id: "agent-a" });
    const actual = review({ id: "r1", kind: "review", agent_id: "agent-a" });
    const result = latestReviewPerAgent([summary, actual]);
    expect(result.map((r) => r.id)).toEqual(["r1"]);
  });

  it("treats a null agent_id as its own key", () => {
    const a = review({ id: "r-null-1", agent_id: null });
    const b = review({ id: "r-null-2", agent_id: null });
    const result = latestReviewPerAgent([a, b]);
    expect(result.map((r) => r.id)).toEqual(["r-null-1"]);
  });
});

describe("findingsByFile", () => {
  it("flattens findings from multiple reviews, grouped by file path", () => {
    const r1 = review({ id: "r1", findings: [finding({ id: "f1", file: "a.ts" })] });
    const r2 = review({
      id: "r2",
      findings: [finding({ id: "f2", file: "a.ts" }), finding({ id: "f3", file: "b.ts" })],
    });
    const byFile = findingsByFile([r1, r2]);
    expect(byFile.get("a.ts")?.map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(byFile.get("b.ts")?.map((f) => f.id)).toEqual(["f3"]);
    expect(byFile.get("missing.ts")).toBeUndefined();
  });
});

describe("findingAnchorKey", () => {
  it("anchors to RIGHT:<start_line>", () => {
    expect(findingAnchorKey(finding({ start_line: 42 }))).toBe("RIGHT:42");
  });

  it("returns null when the finding has no line", () => {
    expect(findingAnchorKey(finding({ start_line: null as unknown as number }))).toBeNull();
  });
});

describe("groupFindingsByAnchor", () => {
  it("groups findings sharing an anchor key, preserving insertion order within a group", () => {
    const a = finding({ id: "f-a", start_line: 5 });
    const b = finding({ id: "f-b", start_line: 5 });
    const c = finding({ id: "f-c", start_line: 9 });
    const grouped = groupFindingsByAnchor([a, b, c]);
    expect(Array.from(grouped.keys())).toEqual(["RIGHT:5", "RIGHT:9"]);
    expect(grouped.get("RIGHT:5")?.map((f) => f.id)).toEqual(["f-a", "f-b"]);
    expect(grouped.get("RIGHT:9")?.map((f) => f.id)).toEqual(["f-c"]);
  });

  it("returns an empty map for an empty finding list", () => {
    expect(groupFindingsByAnchor([]).size).toBe(0);
  });

  it("skips a finding with no valid anchor key rather than throwing", () => {
    const noLine = finding({ id: "f-none", start_line: null as unknown as number });
    const withLine = finding({ id: "f-has", start_line: 3 });
    const grouped = groupFindingsByAnchor([noLine, withLine]);
    expect(Array.from(grouped.values()).flat().map((f) => f.id)).toEqual(["f-has"]);
  });
});

describe("mostSevereFinding", () => {
  it("picks CRITICAL over WARNING and SUGGESTION", () => {
    const critical = finding({ id: "f-crit", severity: "CRITICAL" });
    const warning = finding({ id: "f-warn", severity: "WARNING" });
    const suggestion = finding({ id: "f-sugg", severity: "SUGGESTION" });
    expect(mostSevereFinding([warning, suggestion, critical]).id).toBe("f-crit");
    expect(mostSevereFinding([critical, warning, suggestion]).id).toBe("f-crit");
  });

  it("picks WARNING over SUGGESTION when there's no CRITICAL", () => {
    const warning = finding({ id: "f-warn", severity: "WARNING" });
    const suggestion = finding({ id: "f-sugg", severity: "SUGGESTION" });
    expect(mostSevereFinding([suggestion, warning]).id).toBe("f-warn");
  });

  it("returns the only finding when there's just one", () => {
    const only = finding({ id: "f-only", severity: "SUGGESTION" });
    expect(mostSevereFinding([only]).id).toBe("f-only");
  });

  it("keeps the first finding on a severity tie", () => {
    const first = finding({ id: "f-first", severity: "WARNING" });
    const second = finding({ id: "f-second", severity: "WARNING" });
    expect(mostSevereFinding([first, second]).id).toBe("f-first");
  });
});

describe("buildRoleGroups", () => {
  const smart: SmartDiffResponse = {
    groups: [
      { role: "core", files: [{ path: "src/app.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "tests", files: [] },
      { role: "wiring", files: [{ path: "src/index.ts", additions: 1, deletions: 0, finding_lines: [] }] },
      { role: "docs", files: [] },
      { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", additions: 1, deletions: 0, finding_lines: [] }] },
    ],
    split_suggestion: { too_big: false, total_lines: 3, proposed_splits: [] },
  };

  it("follows the server's group order and drops empty groups", () => {
    const files = [prFile("src/app.ts"), prFile("src/index.ts"), prFile("pnpm-lock.yaml")];
    const groups = buildRoleGroups(smart, files);
    expect(groups.map((g) => g.role)).toEqual(["core", "wiring", "boilerplate"]);
  });

  it("joins group membership to pr.files by path, keeping pr.files' patch/stat data", () => {
    const files = [prFile("src/app.ts", { additions: 7, deletions: 2, patch: "@@ ... @@" })];
    const smartOneGroup: SmartDiffResponse = {
      groups: [{ role: "core", files: [{ path: "src/app.ts", additions: 7, deletions: 2, finding_lines: [] }] }],
      split_suggestion: { too_big: false, total_lines: 9, proposed_splits: [] },
    };
    const groups = buildRoleGroups(smartOneGroup, files);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.files[0]).toEqual(files[0]);
  });

  it("falls back to core for a pr.files entry the response doesn't mention", () => {
    const files = [prFile("src/app.ts"), prFile("src/untracked.ts")];
    const groups = buildRoleGroups(smart, files);
    const core = groups.find((g) => g.role === "core")!;
    expect(core.files.map((f) => f.path)).toEqual(["src/app.ts", "src/untracked.ts"]);
  });

  it("creates a core group for an orphan file when the response has no core group at all", () => {
    const smartNoCore: SmartDiffResponse = {
      groups: [{ role: "wiring", files: [] }],
      split_suggestion: { too_big: false, total_lines: 0, proposed_splits: [] },
    };
    const files = [prFile("src/mystery.ts")];
    const groups = buildRoleGroups(smartNoCore, files);
    expect(groups).toEqual([{ role: "core", files: [files[0]] }]);
  });
});

describe("countFilesWithFindings", () => {
  it("counts files with >=1 finding, not the number of findings", () => {
    const files = [prFile("a.ts"), prFile("b.ts"), prFile("c.ts")];
    const byFile = new Map<string, FindingRecord[]>([
      ["a.ts", [finding({ id: "f1" }), finding({ id: "f2" }), finding({ id: "f3" })]],
      ["b.ts", [finding({ id: "f4" })]],
    ]);
    expect(countFilesWithFindings(files, byFile)).toBe(2);
  });

  it("returns 0 when no file in the group has findings", () => {
    const files = [prFile("a.ts")];
    expect(countFilesWithFindings(files, new Map())).toBe(0);
  });
});
