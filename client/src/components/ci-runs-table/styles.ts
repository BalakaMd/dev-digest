import type { CSSProperties } from "react";

/** Co-located styles for CiRunsTable. */
export const s = {
  wrap: {
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
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  td: { padding: "10px 14px", borderBottom: "1px solid var(--border)", verticalAlign: "middle" } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)", color: "var(--text-secondary)" } satisfies CSSProperties,
  link: { color: "var(--accent)", textDecoration: "none", fontWeight: 600 } satisfies CSSProperties,
  repo: { color: "var(--text-secondary)", marginRight: 6 } satisfies CSSProperties,
  action: {
    background: "none",
    border: "none",
    padding: 0,
    color: "var(--accent)",
    cursor: "pointer",
    font: "inherit",
    fontWeight: 600,
  } satisfies CSSProperties,
} as const;
