import { describe, it, expect } from "vitest";
import type { IntentSource, IntentSourceStatus } from "@devdigest/shared";
import { CONFIDENCE_COLOR, isSourceUnavailable, splitSources } from "./helpers";

function source(status: IntentSourceStatus): IntentSource {
  return { kind: "issue", ref: "acme/api#1", status, bytes: null, detail: null };
}

describe("CONFIDENCE_COLOR", () => {
  it("maps every confidence level to its own colour and background", () => {
    expect(CONFIDENCE_COLOR.high).toEqual({ color: "var(--ok)", bg: "var(--ok-bg)" });
    expect(CONFIDENCE_COLOR.medium).toEqual({ color: "var(--warn)", bg: "var(--warn-bg)" });
    expect(CONFIDENCE_COLOR.low).toEqual({ color: "var(--text-muted)", bg: "var(--crit-bg)" });
  });
});

describe("isSourceUnavailable", () => {
  it.each([
    ["used", false],
    ["truncated", false],
    ["unreachable", true],
    ["unsupported", true],
    ["skipped", true],
  ] as const)("status %s -> %s", (status, expected) => {
    expect(isSourceUnavailable(source(status))).toBe(expected);
  });
});

describe("splitSources", () => {
  it("keeps used/truncated as available and unreachable/unsupported/skipped as unavailable, preserving order", () => {
    const sources = [
      source("used"),
      source("unreachable"),
      source("truncated"),
      source("skipped"),
      source("unsupported"),
    ];
    const { available, unavailable } = splitSources(sources);
    expect(available.map((s) => s.status)).toEqual(["used", "truncated"]);
    expect(unavailable.map((s) => s.status)).toEqual(["unreachable", "skipped", "unsupported"]);
  });

  it("returns two empty arrays for no sources", () => {
    expect(splitSources([])).toEqual({ available: [], unavailable: [] });
  });
});
