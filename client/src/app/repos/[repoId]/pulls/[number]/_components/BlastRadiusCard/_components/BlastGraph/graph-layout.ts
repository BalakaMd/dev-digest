/* graph-layout.ts — pure, React-free layout of the blast-radius graph.
   Symbols keep the server order (already ranked by caller rank); nothing is re-sorted. */
import type { PrBlastRadiusResponse } from "@devdigest/shared";
import {
  COLUMN_X,
  GRAPH_LABEL_MAX_CHARS,
  GRAPH_MAX_CALLERS_PER_SYMBOL,
  GRAPH_MAX_SYMBOLS,
  GRAPH_MAX_TARGETS,
  HEADER_H,
  NODE_H,
  NODE_W,
  PAD,
  ROW_GAP,
} from "./constants";

export type GraphNodeKind = "symbol" | "caller" | "endpoint" | "cron";

export interface GraphNode {
  id: string;
  kind: GraphNodeKind;
  /** Truncated text drawn in the node. */
  label: string;
  /** Untruncated text, used for the tooltip. */
  fullLabel: string;
  x: number;
  y: number;
}

export interface GraphEdge {
  id: string;
  from: string;
  to: string;
  /** `call`: symbol → caller. `reach`: symbol → endpoint/cron (reached through its callers). */
  kind: "call" | "reach";
  /** SVG path data. */
  d: string;
}

export interface GraphLimits {
  maxSymbols: number;
  maxCallersPerSymbol: number;
  maxTargets: number;
  labelMaxChars: number;
}

export const DEFAULT_GRAPH_LIMITS: GraphLimits = {
  maxSymbols: GRAPH_MAX_SYMBOLS,
  maxCallersPerSymbol: GRAPH_MAX_CALLERS_PER_SYMBOL,
  maxTargets: GRAPH_MAX_TARGETS,
  labelMaxChars: GRAPH_LABEL_MAX_CHARS,
};

export interface BlastGraphModel {
  nodes: GraphNode[];
  edges: GraphEdge[];
  width: number;
  height: number;
  hidden: { symbols: number; callers: number; targets: number };
}

export function truncateLabel(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + "…";
}

function basename(path: string): string {
  return path.slice(path.lastIndexOf("/") + 1);
}

/** Smooth horizontal curve from the right side of `a` to the left side of `b`. */
function edgePath(a: GraphNode, b: GraphNode): string {
  const x1 = a.x + NODE_W;
  const y1 = a.y + NODE_H / 2;
  const x2 = b.x;
  const y2 = b.y + NODE_H / 2;
  const mx = (x1 + x2) / 2;
  return `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`;
}

export function buildBlastGraph(
  res: PrBlastRadiusResponse,
  limits: GraphLimits = DEFAULT_GRAPH_LIMITS,
): BlastGraphModel {
  const shown = res.downstream.slice(0, limits.maxSymbols);
  const label = (text: string) => truncateLabel(text, limits.labelMaxChars);

  const symbols: GraphNode[] = [];
  const callers = new Map<string, GraphNode>();
  const links: { from: string; to: string; kind: GraphEdge["kind"] }[] = [];
  const targetLinks: { from: string; key: string; kind: "endpoint" | "cron"; name: string }[] = [];
  let hiddenCallers = 0;

  shown.forEach((item, i) => {
    const id = `s${i}`;
    symbols.push({ id, kind: "symbol", label: label(item.symbol), fullLabel: item.symbol, x: COLUMN_X[0], y: 0 });
    hiddenCallers += Math.max(0, item.callers.length - limits.maxCallersPerSymbol);
    for (const c of item.callers.slice(0, limits.maxCallersPerSymbol)) {
      const key = `${c.file}|${c.line}|${c.name}`;
      const cid = `c:${key}`;
      if (!callers.has(cid)) {
        callers.set(cid, {
          id: cid,
          kind: "caller",
          label: label(`${basename(c.file)}:${c.line}`),
          fullLabel: `${c.name} — ${c.file}:${c.line}`,
          x: COLUMN_X[1],
          y: 0,
        });
      }
      links.push({ from: id, to: cid, kind: "call" });
    }
    for (const name of item.endpoints_affected) targetLinks.push({ from: id, key: `e:${name}`, kind: "endpoint", name });
    for (const name of item.crons_affected) targetLinks.push({ from: id, key: `k:${name}`, kind: "cron", name });
  });

  // Endpoints first, then crons; dedupe by name like `blastCounts`; cap.
  const uniqueTargets: GraphNode[] = [];
  const byKey = new Map<string, GraphNode>();
  for (const kind of ["endpoint", "cron"] as const) {
    for (const l of targetLinks) {
      if (l.kind !== kind || byKey.has(l.key)) continue;
      const node: GraphNode = { id: l.key, kind, label: label(l.name), fullLabel: l.name, x: COLUMN_X[2], y: 0 };
      byKey.set(l.key, node);
      uniqueTargets.push(node);
    }
  }
  const targets = uniqueTargets.slice(0, limits.maxTargets);
  const targetIds = new Set(targets.map((n) => n.id));
  for (const l of targetLinks) {
    if (targetIds.has(l.key)) links.push({ from: l.from, to: l.key, kind: "reach" });
  }

  const columns = [symbols, [...callers.values()], targets];
  const colHeight = (n: number) => (n === 0 ? 0 : n * NODE_H + (n - 1) * ROW_GAP);
  const inner = Math.max(...columns.map((c) => colHeight(c.length)));
  columns.forEach((col) => {
    const offset = (inner - colHeight(col.length)) / 2;
    col.forEach((node, i) => {
      node.y = PAD + HEADER_H + offset + i * (NODE_H + ROW_GAP);
    });
  });

  const nodes = columns.flat();
  const index = new Map(nodes.map((n) => [n.id, n]));
  const edges: GraphEdge[] = links.map((l) => ({
    id: `${l.from}>${l.to}`,
    from: l.from,
    to: l.to,
    kind: l.kind,
    d: edgePath(index.get(l.from)!, index.get(l.to)!),
  }));

  return {
    nodes,
    edges,
    width: COLUMN_X[2] + NODE_W + PAD,
    height: PAD * 2 + HEADER_H + inner,
    hidden: {
      symbols: res.downstream.length - shown.length,
      callers: hiddenCallers,
      targets: uniqueTargets.length - targets.length,
    },
  };
}
