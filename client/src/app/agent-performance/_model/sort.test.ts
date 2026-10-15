import { describe, it, expect } from "vitest";
import { acceptOf, rowOf } from "../../../test/agent-performance-fixtures";
import { nextSort, sortRows } from "./sort";

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("sortRows — Accept (AC-33, AC-34)", () => {
  const rows = [
    rowOf("a1", "Low sample high", { accept: acceptOf(3, 0) }), // 100 %, 3 decisions
    rowOf("a2", "Settled 60", { accept: acceptOf(6, 4) }), // 60 %, 10 decisions
    rowOf("a3", "No rate", { accept: acceptOf(0, 0) }),
    rowOf("a4", "Settled 80", { accept: acceptOf(80, 20) }),
    rowOf("a5", "Settled 80 b", { accept: acceptOf(40, 10) }), // 80 %, ties with a4 → by name
  ];

  it("descending: rates with 10+ decisions, then low samples, then no rate", () => {
    expect(names(sortRows(rows, "accept", "desc"))).toEqual([
      "Settled 80",
      "Settled 80 b",
      "Settled 60",
      "Low sample high",
      "No rate",
    ]);
  });

  it("ascending keeps the same groups and reverses only inside each group", () => {
    expect(names(sortRows(rows, "accept", "asc"))).toEqual([
      "Settled 60",
      "Settled 80",
      "Settled 80 b",
      "Low sample high",
      "No rate",
    ]);
  });

  it("returns a new array and leaves the input alone", () => {
    const input = [...rows];
    const out = sortRows(input, "accept", "desc");
    expect(out).not.toBe(input);
    expect(input).toEqual(rows);
  });
});

describe("sortRows — the other columns (AC-52)", () => {
  const rows = [
    rowOf("a1", "Bravo", { runs: 5, avg_cost_usd: 0.2, last_run_at: "2026-10-10T10:00:00Z" }),
    rowOf("a2", "Alpha", { runs: 5, avg_cost_usd: null, last_run_at: null }),
    rowOf("a3", "Charlie", { runs: 9, avg_cost_usd: 0.1, last_run_at: "2026-10-12T10:00:00Z" }),
  ];

  it("sorts by the column, ties by name", () => {
    expect(names(sortRows(rows, "runs", "desc"))).toEqual(["Charlie", "Alpha", "Bravo"]);
    expect(names(sortRows(rows, "runs", "asc"))).toEqual(["Alpha", "Bravo", "Charlie"]);
  });

  it("puts rows with no value last in both directions", () => {
    expect(names(sortRows(rows, "avg_cost", "asc"))).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(names(sortRows(rows, "avg_cost", "desc"))).toEqual(["Bravo", "Charlie", "Alpha"]);
    expect(names(sortRows(rows, "last_run", "desc"))).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(names(sortRows(rows, "last_run", "asc"))).toEqual(["Bravo", "Charlie", "Alpha"]);
  });
});

describe("nextSort — header activation", () => {
  it("toggles the direction of the active column and starts another column descending", () => {
    expect(nextSort({ column: "accept", dir: "desc" }, "accept")).toEqual({ column: "accept", dir: "asc" });
    expect(nextSort({ column: "accept", dir: "asc" }, "accept")).toEqual({ column: "accept", dir: "desc" });
    expect(nextSort({ column: "accept", dir: "asc" }, "runs")).toEqual({ column: "runs", dir: "desc" });
  });
});
