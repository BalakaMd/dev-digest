import { describe, it, expect } from "vitest";
import type { FindingRecord } from "@devdigest/shared";
import { evalCaseNameByFinding, severityCounts, visibleFindings } from "./helpers";

function finding(over: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "WARNING",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

const FINDINGS: FindingRecord[] = [
  finding({ id: "s1", severity: "SUGGESTION" }),
  finding({ id: "c1", severity: "CRITICAL" }),
  finding({ id: "w1", severity: "WARNING" }),
  finding({ id: "c2", severity: "CRITICAL", confidence: 0.3 }),
];

describe("severityCounts", () => {
  it("counts per severity in severity order, omitting absent ones", () => {
    expect(severityCounts(FINDINGS)).toEqual([
      ["CRITICAL", 2],
      ["WARNING", 1],
      ["SUGGESTION", 1],
    ]);
  });

  it("returns an empty list for no findings", () => {
    expect(severityCounts([])).toEqual([]);
  });
});

describe("visibleFindings severity filter", () => {
  it("keeps only the selected severity", () => {
    const shown = visibleFindings(FINDINGS, false, "CRITICAL");
    expect(shown.map((f) => f.id)).toEqual(["c1", "c2"]);
  });

  it("no filter keeps everything, sorted by severity", () => {
    const shown = visibleFindings(FINDINGS, false, null);
    expect(shown.map((f) => f.severity)).toEqual([
      "CRITICAL",
      "CRITICAL",
      "WARNING",
      "SUGGESTION",
    ]);
  });

  it("composes with hide-low-confidence", () => {
    const shown = visibleFindings(FINDINGS, true, "CRITICAL");
    expect(shown.map((f) => f.id)).toEqual(["c1"]);
  });
});

describe("visibleFindings order stability (AC-1)", () => {
  it("keeps the mutual order within a severity when a finding is accepted or dismissed", () => {
    const base = [
      finding({ id: "a", severity: "WARNING" }),
      finding({ id: "b", severity: "WARNING" }),
      finding({ id: "c", severity: "WARNING" }),
    ];
    const ids = (fs: FindingRecord[]) => visibleFindings(fs, false).map((f) => f.id);
    const accepted = base.map((f) => (f.id === "a" ? { ...f, accepted_at: "2026-10-08T00:00:00Z" } : f));
    const dismissed = base.map((f) => (f.id === "a" ? { ...f, dismissed_at: "2026-10-08T00:00:00Z" } : f));
    expect(ids(accepted)).toEqual(["a", "b", "c"]);
    expect(ids(dismissed)).toEqual(["a", "b", "c"]);
  });
});

describe("evalCaseNameByFinding", () => {
  it("maps finding id to case name and skips cases without a source finding", () => {
    const map = evalCaseNameByFinding([
      { source_finding_id: "f1", name: "stripe-key" },
      { source_finding_id: null, name: "hand-written" },
    ]);
    expect([...map.entries()]).toEqual([["f1", "stripe-key"]]);
  });

  it("returns an empty map while the cases are not loaded", () => {
    expect(evalCaseNameByFinding(undefined).size).toBe(0);
  });
});
