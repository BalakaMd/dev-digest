import type { CSSProperties } from "react";
import type { GraphNodeKind } from "./graph-layout";

/** Co-located styles for BlastGraph. Colours come from the UI kit's CSS tokens. */
export const s = {
  scroll: { overflow: "auto", maxWidth: "100%" } satisfies CSSProperties,
  svg: { display: "block", width: "100%", height: "auto" } satisfies CSSProperties,
  legend: {
    display: "flex",
    flexWrap: "wrap",
    gap: 14,
    margin: "10px 0 0",
    padding: 0,
    listStyle: "none",
    fontSize: 12,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  more: { fontSize: 12, color: "var(--text-muted)", margin: "8px 0 0" } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;

/** Stroke / fill per node kind. */
export const NODE_COLORS: Record<GraphNodeKind, { stroke: string; fill: string }> = {
  symbol: { stroke: "var(--accent)", fill: "var(--accent-bg)" },
  caller: { stroke: "var(--border)", fill: "var(--bg-elevated)" },
  endpoint: { stroke: "var(--ok)", fill: "var(--ok-bg)" },
  cron: { stroke: "var(--warn)", fill: "var(--warn-bg)" },
};
