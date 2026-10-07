import { describe, it, expect } from "vitest";
import { parseDiffTarget } from "./diff-target";

const FILES = [{ path: "src/app.ts" }, { path: "README.md" }];

describe("parseDiffTarget", () => {
  it("returns none without a file, a target for an exact changed file, and missing for any other path", () => {
    expect(parseDiffTarget(null, "3", FILES)).toEqual({ kind: "none" });
    expect(parseDiffTarget("src/app.ts", "3", FILES)).toEqual({ kind: "target", file: "src/app.ts", line: 3 });
    expect(parseDiffTarget("src/app.ts", null, FILES)).toEqual({ kind: "target", file: "src/app.ts", line: null });
    expect(parseDiffTarget("src/nope.ts", "3", FILES)).toEqual({ kind: "missing" });
    // exact match only: no case folding, no `./` normalisation, no traversal
    expect(parseDiffTarget("SRC/APP.TS", null, FILES)).toEqual({ kind: "missing" });
    expect(parseDiffTarget("./src/app.ts", null, FILES)).toEqual({ kind: "missing" });
    expect(parseDiffTarget("src/../src/app.ts", null, FILES)).toEqual({ kind: "missing" });
  });

  it("keeps a line only when it is a whole number >= 1 (untrusted query string)", () => {
    const line = (v: string | null) => {
      const r = parseDiffTarget("src/app.ts", v, FILES);
      return r.kind === "target" ? r.line : "not-target";
    };
    expect(line("12")).toBe(12);
    for (const bad of ["0", "-1", "1.5", "1e3", "abc", "", " 3", "99999999999999999999"]) {
      expect(line(bad)).toBeNull();
    }
  });
});
