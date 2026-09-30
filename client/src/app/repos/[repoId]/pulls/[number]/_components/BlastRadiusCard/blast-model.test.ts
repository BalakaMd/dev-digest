import { describe, it, expect } from "vitest";
import type { PrBlastRadiusResponse } from "@devdigest/shared";
import { blastCounts, callerLinkSha, symbolsWithoutCallers } from "./blast-model";

function res(over: Partial<PrBlastRadiusResponse> = {}): PrBlastRadiusResponse {
  return {
    changed_symbols: [],
    downstream: [],
    summary: "",
    degraded: false,
    degraded_reason: null,
    indexed_sha: null,
    ...over,
  };
}

const sym = (name: string) => ({ name, file: "src/x.ts", kind: "function" });
const impact = (
  symbol: string,
  callers: number,
  endpoints: string[] = [],
  crons: string[] = [],
) => ({
  symbol,
  callers: Array.from({ length: callers }, (_, i) => ({ name: `c${i}`, file: `src/c${i}.ts`, line: i + 1 })),
  endpoints_affected: endpoints,
  crons_affected: crons,
});

describe("blastCounts", () => {
  it("counts changed symbols and all callers across symbols", () => {
    const counts = blastCounts(
      res({
        changed_symbols: [sym("a"), sym("b"), sym("c")],
        downstream: [impact("a", 2), impact("b", 3)],
      }),
    );
    expect(counts).toMatchObject({ symbols: 3, callers: 5 });
  });

  it("counts an endpoint or cron reached by several symbols once", () => {
    const counts = blastCounts(
      res({
        changed_symbols: [sym("a"), sym("b")],
        downstream: [
          impact("a", 1, ["GET /x", "GET /y"], ["nightly"]),
          impact("b", 1, ["GET /x"], ["nightly", "hourly"]),
        ],
      }),
    );
    expect(counts.endpoints).toBe(2);
    expect(counts.crons).toBe(2);
  });

  it("is all zeros for an empty map", () => {
    expect(blastCounts(res())).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
  });
});

describe("symbolsWithoutCallers", () => {
  it("returns the changed symbols that have no downstream entry, in changed order", () => {
    expect(
      symbolsWithoutCallers(
        res({
          changed_symbols: [sym("a"), sym("lonely1"), sym("b"), sym("lonely2")],
          downstream: [impact("a", 1), impact("b", 1)],
        }),
      ),
    ).toEqual(["lonely1", "lonely2"]);
  });

  it("returns every changed symbol when there are no callers, and none when all have callers", () => {
    expect(symbolsWithoutCallers(res({ changed_symbols: [sym("a"), sym("b")] }))).toEqual(["a", "b"]);
    expect(
      symbolsWithoutCallers(res({ changed_symbols: [sym("a")], downstream: [impact("a", 1)] })),
    ).toEqual([]);
  });
});

describe("callerLinkSha", () => {
  it("uses the indexed sha, because caller line numbers refer to that commit", () => {
    expect(callerLinkSha(res({ indexed_sha: "indexed" }), "head")).toBe("indexed");
  });

  it("falls back to the PR head sha when there is no index", () => {
    expect(callerLinkSha(res({ indexed_sha: null }), "head")).toBe("head");
  });
});
