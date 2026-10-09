import type { CSSProperties } from "react";

/** Co-located styles for the agent editor's Evals tab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  metricsHeader: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  metricsTitle: { fontSize: 12, letterSpacing: "0.08em", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  dashLink: { fontSize: 13, color: "var(--text-secondary)", textDecoration: "none" } satisfies CSSProperties,
  casesHeader: { display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  casesTitle: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  casesCount: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  headerActions: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-muted)", textAlign: "right" } satisfies CSSProperties,
  status: { fontSize: 13, color: "var(--text-secondary)", minHeight: 18 } satisfies CSSProperties,
  statusFailed: { fontSize: 13, color: "var(--crit)" } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
} as const;
