import type { CSSProperties } from "react";

/** Co-located styles for the eval metric tiles. */
export const s = {
  grid: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 } satisfies CSSProperties,
  tile: {
    padding: "14px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  label: { fontSize: 11, letterSpacing: "0.08em", color: "var(--text-muted)", fontWeight: 600 } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 8 } satisfies CSSProperties,
  value: { fontSize: 28, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  delta: (pp: number): CSSProperties => ({
    fontSize: 12.5,
    fontWeight: 600,
    color: pp > 0 ? "var(--ok)" : pp < 0 ? "var(--crit)" : "var(--text-muted)",
  }),
  note: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
