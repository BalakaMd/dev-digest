import { describe, it, expect } from "vitest";
import type { DownstreamImpact, PrBlastRadiusResponse } from "@devdigest/shared";
import { blastCounts } from "../../blast-model";
import {
  GRAPH_LABEL_MAX_CHARS,
  GRAPH_MAX_CALLERS_PER_SYMBOL,
  GRAPH_MAX_SYMBOLS,
  GRAPH_MAX_TARGETS,
  NODE_H,
  NODE_W,
} from "./constants";
import { buildBlastGraph, truncateLabel } from "./graph-layout";

const impact = (symbol: string, over: Partial<DownstreamImpact> = {}): DownstreamImpact => ({
  symbol,
  callers: [],
  endpoints_affected: [],
  crons_affected: [],
  ...over,
});

const response = (downstream: DownstreamImpact[]): PrBlastRadiusResponse => ({
  changed_symbols: downstream.map((d) => ({ name: d.symbol, file: "src/a.ts", kind: "function" })),
  downstream,
  summary: "",
  degraded: false,
  degraded_reason: null,
  indexed_sha: null,
});

const caller = (name: string, file = "src/x/y.ts", line = 1) => ({ name, file, line });

describe("truncateLabel", () => {
  it("keeps short text and cuts long text with an ellipsis at the limit", () => {
    expect(truncateLabel("short", GRAPH_LABEL_MAX_CHARS)).toBe("short");
    const long = "x".repeat(GRAPH_LABEL_MAX_CHARS + 5);
    const out = truncateLabel(long, GRAPH_LABEL_MAX_CHARS);
    expect(out).toHaveLength(GRAPH_LABEL_MAX_CHARS);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildBlastGraph", () => {
  it("keeps the server order of symbols", () => {
    const g = buildBlastGraph(response([impact("zeta"), impact("alpha"), impact("mid")]));
    expect(g.nodes.filter((n) => n.kind === "symbol").map((n) => n.fullLabel)).toEqual(["zeta", "alpha", "mid"]);
  });

  it("caps symbols, callers per symbol and targets, and reports what is hidden", () => {
    const many = Array.from({ length: GRAPH_MAX_SYMBOLS + 3 }, (_, i) => impact(`s${i}`));
    expect(buildBlastGraph(response(many)).hidden.symbols).toBe(3);

    const callers = Array.from({ length: GRAPH_MAX_CALLERS_PER_SYMBOL + 2 }, (_, i) => caller(`c${i}`, "f.ts", i));
    const g = buildBlastGraph(response([impact("a", { callers })]));
    expect(g.nodes.filter((n) => n.kind === "caller")).toHaveLength(GRAPH_MAX_CALLERS_PER_SYMBOL);
    expect(g.hidden.callers).toBe(2);

    const endpoints = Array.from({ length: GRAPH_MAX_TARGETS + 4 }, (_, i) => `GET /e${i}`);
    const t = buildBlastGraph(response([impact("a", { endpoints_affected: endpoints })]));
    expect(t.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(GRAPH_MAX_TARGETS);
    expect(t.hidden.targets).toBe(4);
    expect(t.edges.filter((e) => e.kind === "reach")).toHaveLength(GRAPH_MAX_TARGETS);
  });

  it("draws a caller shared by two symbols once, with two edges", () => {
    const shared = caller("checkout", "src/api.ts", 7);
    const g = buildBlastGraph(response([impact("a", { callers: [shared] }), impact("b", { callers: [shared] })]));
    const callerNodes = g.nodes.filter((n) => n.kind === "caller");
    expect(callerNodes).toHaveLength(1);
    expect(g.edges.filter((e) => e.to === callerNodes[0]!.id)).toHaveLength(2);
    expect(callerNodes[0]!.label).toBe("api.ts:7");
    expect(callerNodes[0]!.fullLabel).toBe("checkout — src/api.ts:7");
  });

  it("dedupes endpoints and crons like the headline counts and keeps crons as their own kind", () => {
    const res = response([
      impact("a", { endpoints_affected: ["POST /x", "GET /y"], crons_affected: ["nightly"] }),
      impact("b", { endpoints_affected: ["POST /x"], crons_affected: ["nightly", "weekly"] }),
    ]);
    const g = buildBlastGraph(res);
    const counts = blastCounts(res);
    expect(g.nodes.filter((n) => n.kind === "endpoint")).toHaveLength(counts.endpoints);
    expect(g.nodes.filter((n) => n.kind === "cron").map((n) => n.fullLabel)).toEqual(["nightly", "weekly"]);
    expect(g.nodes.filter((n) => n.kind === "cron")).toHaveLength(counts.crons);
  });

  it("starts each edge at its source and ends it at its target", () => {
    const g = buildBlastGraph(response([impact("a", { callers: [caller("c")], endpoints_affected: ["GET /e"] })]));
    const byId = new Map(g.nodes.map((n) => [n.id, n]));
    for (const e of g.edges) {
      const from = byId.get(e.from)!;
      const to = byId.get(e.to)!;
      const nums = e.d.match(/-?\d+(\.\d+)?/g)!.map(Number);
      expect(e.d.startsWith(`M ${from.x + NODE_W} ${from.y + NODE_H / 2}`)).toBe(true);
      expect(nums.slice(-2)).toEqual([to.x, to.y + NODE_H / 2]);
    }
    expect(g.edges.map((e) => e.kind).sort()).toEqual(["call", "reach"]);
  });
});
