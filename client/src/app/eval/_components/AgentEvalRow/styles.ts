import type { CSSProperties } from "react";

/** Co-located styles for one agent row of the Eval Dashboard. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "14px 18px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    color: "inherit",
    textDecoration: "none",
  } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8 } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  chip: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 11.5,
    padding: "1px 7px",
    borderRadius: 5,
    border: "1px solid var(--border)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  badge: {
    fontSize: 11,
    fontWeight: 600,
    padding: "1px 7px",
    borderRadius: 5,
    background: "var(--bg-hover, rgba(128,128,128,.15))",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  sub: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  progress: { fontSize: 12.5, fontWeight: 600, color: "var(--accent)" } satisfies CSSProperties,
  spark: { width: 80, display: "flex", justifyContent: "center" } satisfies CSSProperties,
  metrics: { display: "flex", gap: 22 } satisfies CSSProperties,
  metric: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 48 } satisfies CSSProperties,
  metricLabel: { fontSize: 10.5, letterSpacing: "0.06em", color: "var(--text-muted)" } satisfies CSSProperties,
  metricValue: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  chevron: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
