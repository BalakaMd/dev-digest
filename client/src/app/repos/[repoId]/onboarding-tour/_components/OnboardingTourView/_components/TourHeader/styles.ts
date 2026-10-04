import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 6 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  title: { margin: 0, fontSize: 28, fontWeight: 700, letterSpacing: "-0.02em", overflowWrap: "anywhere" } satisfies CSSProperties,
  repo: { color: "var(--accent-text)" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  provenance: { margin: 0, color: "var(--text-secondary)", fontSize: 14 } satisfies CSSProperties,
  changes: { display: "flex", flexWrap: "wrap", gap: "4px 16px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  change: { display: "inline-flex", alignItems: "center", gap: 6 } satisfies CSSProperties,
  hidden: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
};
