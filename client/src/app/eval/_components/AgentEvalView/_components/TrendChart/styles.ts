import type { CSSProperties } from "react";

/** Co-located styles for TrendChart. */
export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-surface)",
    padding: "14px 18px 10px",
    marginBottom: 20,
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  title: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, listStyle: "none", margin: 0, padding: 0, fontSize: 13 } satisfies CSSProperties,
  legendItem: { display: "inline-flex", alignItems: "center", gap: 6, color: "var(--text-secondary)" } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 12, height: 3, borderRadius: 2, background: color }),
  plot: { width: "100%", height: 240, marginTop: 8 } satisfies CSSProperties,
  empty: { fontSize: 13.5, color: "var(--text-secondary)", padding: "24px 0" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
