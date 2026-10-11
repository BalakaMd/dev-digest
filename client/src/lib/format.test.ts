/**
 * formatCostUsd carries a product rule, not just a display choice: "—" means we
 * have no cost for a run, "$0.00" means the run genuinely was free (the price
 * book lists free models at 0). Conflating the two would tell a user a paid
 * review cost nothing, so both directions are pinned here.
 */
import { describe, it, expect } from "vitest";
import {
  formatCostUsd,
  formatTokenCount,
  formatMetricPct,
  formatDeltaPts,
  formatCostOrDash,
  formatRunTime,
  EMPTY,
} from "./format";

describe("formatCostUsd", () => {
  it("renders each cost band the way the design does", () => {
    // One rule (4dp, trim trailing zeros, 2dp floor) has to cover three orders
    // of magnitude — these are the exact values from the mockups.
    expect(formatCostUsd(0.0013)).toBe("$0.0013"); // flash model, small diff
    expect(formatCostUsd(0.014)).toBe("$0.014");
    expect(formatCostUsd(0.06)).toBe("$0.06"); // whole cents still read as money
    expect(formatCostUsd(0.003)).toBe("$0.003");
  });

  it("distinguishes 'no data' from 'free'", () => {
    expect(formatCostUsd(null)).toBe(EMPTY);
    expect(formatCostUsd(undefined)).toBe(EMPTY);
    expect(formatCostUsd(NaN)).toBe(EMPTY);
    expect(formatCostUsd(0)).toBe("$0.00");
  });

  it("never rounds a real cost down to a free-looking $0.0000", () => {
    expect(formatCostUsd(0.00002)).toBe("<$0.0001");
  });

  it("keeps dollars readable above $1", () => {
    expect(formatCostUsd(1.5)).toBe("$1.50");
    expect(formatCostUsd(12.3456)).toBe("$12.3456");
  });
});

describe("formatTokenCount", () => {
  it("separates thousands with spaces, not commas", () => {
    expect(formatTokenCount(9119)).toBe("9 119");
    expect(formatTokenCount(150)).toBe("150");
    expect(formatTokenCount(1234567)).toBe("1 234 567");
  });
});

describe("eval metric formatters (AC-29, AC-63)", () => {
  it("renders a metric as a whole percentage and no value as a dash, never 0%", () => {
    expect(formatMetricPct(0.824)).toBe("82%");
    expect(formatMetricPct(1)).toBe("100%");
    expect(formatMetricPct(0)).toBe("0%"); // a real zero
    expect(formatMetricPct(null)).toBe(EMPTY);
    expect(formatMetricPct(undefined)).toBe(EMPTY);
  });

  it("signs the delta with an arrow, and shows nothing without one", () => {
    expect(formatDeltaPts(4)).toBe("▲ 4 pt");
    expect(formatDeltaPts(-2.4)).toBe("▼ 2 pt");
    expect(formatDeltaPts(0.2)).toBe("0 pt");
    expect(formatDeltaPts(null)).toBe("");
  });

  it("renders unknown cost as a dash and a known cost like formatCostUsd", () => {
    expect(formatCostOrDash(null)).toBe(EMPTY);
    expect(formatCostOrDash(0)).toBe("$0.00");
    expect(formatCostOrDash(0.014)).toBe("$0.014");
  });
});

describe("formatRunTime", () => {
  it("renders a stable UTC minute stamp and passes unparseable input through", () => {
    expect(formatRunTime("2026-05-29T09:14:33Z")).toBe("2026-05-29 09:14");
    expect(formatRunTime("not a date")).toBe("not a date");
  });
});
