import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboardView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  status: { minHeight: 18, fontSize: 12.5, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  heading: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "20px 0 10px",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  tableWrap: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflowX: "auto",
  } satisfies CSSProperties,
  table: { width: "100%", borderCollapse: "collapse", fontSize: 13 } satisfies CSSProperties,
  th: {
    textAlign: "left",
    padding: "9px 14px",
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  td: { padding: "10px 14px", borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" } satisfies CSSProperties,
  strong: { fontWeight: 600 } satisfies CSSProperties,
  statusDone: { color: "var(--text-secondary)" } satisfies CSSProperties,
  statusRunning: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  statusFailed: { color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
} as const;
