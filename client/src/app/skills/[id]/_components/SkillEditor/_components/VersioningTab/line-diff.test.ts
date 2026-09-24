import { describe, it, expect } from "vitest";
import { diffLines, diffStat } from "./line-diff";

describe("line-diff", () => {
  it("marks added, removed and unchanged lines in order", () => {
    expect(diffLines("a\nb\nc", "a\nc\nd")).toEqual([
      { kind: "same", text: "a" },
      { kind: "remove", text: "b" },
      { kind: "same", text: "c" },
      { kind: "add", text: "d" },
    ]);
  });

  it("an identical body has no changes", () => {
    expect(diffStat(diffLines("x\ny", "x\ny"))).toEqual({ added: 0, removed: 0 });
  });

  it("counts a rewrite as removals plus additions", () => {
    expect(diffStat(diffLines("old", "new\nlines"))).toEqual({ added: 2, removed: 1 });
  });
});
