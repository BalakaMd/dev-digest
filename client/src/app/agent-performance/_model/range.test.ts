import { describe, it, expect } from "vitest";
import { rangeKey, rangeLabel, resolveInstants, validateCustomRange } from "./range";

const NOW = new Date(2026, 9, 14, 12, 30, 0); // 14 Oct 2026, local time (passes in any TZ)
const HOUR = 3_600_000;

describe("resolveInstants — the two instants a range is sent as (AC-5)", () => {
  it('"1 day" is [now − 24 h, now]', () => {
    const { from, to } = resolveInstants({ kind: "1d" }, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(Date.parse(to) - Date.parse(from)).toBe(24 * HOUR);
  });

  it('"30 days" is [now − 30 × 24 h, now]', () => {
    const { from, to } = resolveInstants({ kind: "30d" }, NOW);
    expect(to).toBe(NOW.toISOString());
    expect(Date.parse(to) - Date.parse(from)).toBe(30 * 24 * HOUR);
  });

  it("a custom range is the local midnight of the start date to the local midnight after the end date", () => {
    const { from, to } = resolveInstants({ kind: "custom", start: "2026-09-01", end: "2026-09-30" }, NOW);
    expect(from).toBe(new Date(2026, 8, 1).toISOString());
    expect(to).toBe(new Date(2026, 9, 1).toISOString()); // the day after the end date
  });

  it("rolls the day after the end date over a month and a year end", () => {
    expect(resolveInstants({ kind: "custom", start: "2026-12-31", end: "2026-12-31" }, NOW).to).toBe(
      new Date(2027, 0, 1).toISOString(),
    );
    expect(resolveInstants({ kind: "custom", start: "2026-01-31", end: "2026-01-31" }, NOW).to).toBe(
      new Date(2026, 1, 1).toISOString(),
    );
  });

  it("refuses to build instants for an incomplete custom range", () => {
    expect(() => resolveInstants({ kind: "custom", start: "2026-09-01" }, NOW)).toThrow();
  });
});

describe("validateCustomRange — inline errors (AC-6)", () => {
  it("accepts a range that ends today and a range of exactly 366 days", () => {
    expect(validateCustomRange("2026-10-14", "2026-10-14", NOW)).toBeNull();
    expect(validateCustomRange("2025-10-14", "2026-10-14", NOW)).toBeNull();
  });

  it("rejects an end before the start, an end after today and a range over 366 days", () => {
    expect(validateCustomRange("2026-09-30", "2026-09-01", NOW)).toBe("endBeforeStart");
    expect(validateCustomRange("2026-10-14", "2026-10-15", NOW)).toBe("endInFuture");
    expect(validateCustomRange("2025-10-13", "2026-10-14", NOW)).toBe("tooLong");
  });

  it("rejects a missing or non-existent date", () => {
    expect(validateCustomRange("", "2026-09-01", NOW)).toBe("incomplete");
    expect(validateCustomRange("2026-02-30", "2026-03-01", NOW)).toBe("incomplete");
  });
});

describe("range labels and cache key (AC-4)", () => {
  it('labels the cards "1D", "30D" and "<start> – <end>"', () => {
    expect(rangeLabel({ kind: "1d" })).toBe("1D");
    expect(rangeLabel({ kind: "30d" })).toBe("30D");
    expect(rangeLabel({ kind: "custom", start: "2026-09-01", end: "2026-09-30" })).toBe("2026-09-01 – 2026-09-30");
  });

  it("keys the cache by the range choice, never by the instants (so 'now' is resolved at send time)", () => {
    expect(rangeKey({ kind: "30d" })).toBe("30d");
    expect(rangeKey({ kind: "custom", start: "2026-09-01", end: "2026-09-30" })).toBe("custom:2026-09-01:2026-09-30");
  });
});
