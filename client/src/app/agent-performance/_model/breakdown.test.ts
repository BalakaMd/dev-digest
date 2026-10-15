import { describe, it, expect } from "vitest";
import { buildBreakdown, formatLegendUsd, hasNoPricedRuns, type SliceInput } from "./breakdown";

const slice = (id: string | null, name: string, amount: number): SliceInput => ({ id, name, amount });

describe("buildBreakdown — legend lists every slice, shares are whole percentages (AC-38)", () => {
  it("orders by amount descending, then by name, and gives each slice its share of Total cost", () => {
    const b = buildBreakdown(
      [slice("b", "Beta", 2), slice("a", "Alpha", 2), slice("c", "Gamma", 6)],
      10,
      "Other",
    );
    expect(b.legend.map((l) => [l.name, l.percent])).toEqual([
      ["Gamma", 60],
      ["Alpha", 20],
      ["Beta", 20],
    ]);
    expect(b.segments).toEqual(b.legend); // 3 slices: no "Other"
    expect(b.neutral).toBe(false);
  });
});

describe("buildBreakdown — more than 6 slices (AC-51)", () => {
  const eight = Array.from({ length: 8 }, (_, i) => slice(`s${i}`, `Agent ${i}`, 8 - i)); // 8,7,...,1 → 36

  it("shows the 6 largest on their own plus one Other segment with the sum of the rest; the legend keeps all 8", () => {
    const b = buildBreakdown(eight, 36, "Other");
    expect(b.segments).toHaveLength(7);
    expect(b.segments.slice(0, 6).map((s) => s.name)).toEqual(eight.slice(0, 6).map((s) => s.name));
    expect(b.segments[6]).toMatchObject({ name: "Other", amount: 3, percent: 8 }); // 2 + 1 of 36
    expect(b.legend).toHaveLength(8);
    expect(b.legend.map((l) => l.name)).not.toContain("Other");
  });

  it("does not collapse exactly 6 slices", () => {
    const b = buildBreakdown(eight.slice(0, 6), 33, "Other");
    expect(b.segments).toHaveLength(6);
    expect(b.segments.map((s) => s.name)).not.toContain("Other");
  });
});

describe("buildBreakdown — Total cost 0 (Q-3)", () => {
  it("never divides by zero: every share is 0 and the ring is neutral", () => {
    const b = buildBreakdown([slice("a", "Free agent", 0)], 0, "Other");
    expect(b.neutral).toBe(true);
    expect(b.legend).toEqual([{ id: "a", name: "Free agent", amount: 0, percent: 0 }]);
  });
});

describe("hasNoPricedRuns — the 'No priced runs' message (AC-39)", () => {
  it("holds only when there are counted runs and none has a cost", () => {
    expect(hasNoPricedRuns(5, 5)).toBe(true);
    expect(hasNoPricedRuns(5, 4)).toBe(false);
    expect(hasNoPricedRuns(0, 0)).toBe(false);
  });
});

describe("formatLegendUsd", () => {
  it("uses 3 decimals and never shows a non-zero amount as $0.000", () => {
    expect(formatLegendUsd(0.03)).toBe("$0.030");
    expect(formatLegendUsd(0.0001)).toBe("<$0.001");
    expect(formatLegendUsd(0)).toBe("$0.000");
  });
});
