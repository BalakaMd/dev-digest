import { describe, it, expect } from "vitest";
import {
  appendSkeleton,
  diffFilePaths,
  FINDING_SKELETON,
  formatExpectedOutput,
  validateExpectedOutput,
} from "./expected-output";

const ok = { type: "must_find", file: "src/a.ts", start_line: 1, end_line: 3 };

describe("validateExpectedOutput (mirror of EvalExpectedOutput, AC-71 / AC-47)", () => {
  it("accepts a non-empty list, with or without notes", () => {
    expect(validateExpectedOutput(JSON.stringify([ok])).ok).toBe(true);
    expect(
      validateExpectedOutput(JSON.stringify([{ ...ok, type: "must_not_flag", title: "t", severity: null, category: "x" }])).ok,
    ).toBe(true);
  });

  it.each([
    ["{not json", "notJson"],
    ["{}", "notArray"],
    ["[]", "notArray"],
    [JSON.stringify([ok, 5]), "badType"],
    [JSON.stringify([{ ...ok, type: "maybe" }]), "badType"],
    [JSON.stringify([{ ...ok, file: "" }]), "badFile"],
    [JSON.stringify([{ ...ok, start_line: null }]), "badLines"],
    [JSON.stringify([{ ...ok, end_line: 1.5 }]), "badLines"],
    [JSON.stringify([{ ...ok, title: 3 }]), "badNotes"],
  ])("rejects %s as %s", (text, reason) => {
    const r = validateExpectedOutput(text);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe(reason);
  });

  it("points at the offending expectation (1-based)", () => {
    const r = validateExpectedOutput(JSON.stringify([ok, { ...ok, file: "" }]));
    expect(r).toEqual({ ok: false, reason: "badFile", index: 2 });
  });

  it("does not accept the empty skeleton as valid (every field present but empty)", () => {
    expect(validateExpectedOutput(JSON.stringify([FINDING_SKELETON])).ok).toBe(false);
  });
});

describe("appendSkeleton (AC-48)", () => {
  it("appends one expectation with all seven fields present and empty at the end", () => {
    const next = JSON.parse(appendSkeleton(formatExpectedOutput([ok])));
    expect(next).toHaveLength(2);
    expect(next[0]).toEqual(ok);
    expect(next[1]).toEqual({ type: "", file: "", start_line: null, end_line: null, title: "", severity: "", category: "" });
  });

  it("starts a list when the text is not a list", () => {
    expect(JSON.parse(appendSkeleton("garbage"))).toHaveLength(1);
  });
});

describe("diffFilePaths (Files tab, AC-54)", () => {
  it("lists each file once, including deletions", () => {
    const diff = [
      "diff --git a/src/a.ts b/src/a.ts",
      "--- a/src/a.ts",
      "+++ b/src/a.ts",
      "@@ -1 +1 @@",
      "diff --git a/old.ts b/old.ts",
      "--- a/old.ts",
      "+++ /dev/null",
    ].join("\n");
    expect(diffFilePaths(diff)).toEqual(["src/a.ts", "old.ts"]);
    expect(diffFilePaths("")).toEqual([]);
  });
});
