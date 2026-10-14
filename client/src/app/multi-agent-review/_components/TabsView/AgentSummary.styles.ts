import type { CSSProperties } from "react";

export const s = {
  root: (color: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    borderLeft: `3px solid ${color}`,
    background: "var(--bg-surface)",
  }),
  score: { display: "flex", flexDirection: "column", alignItems: "center", gap: 2, minWidth: 52 } satisfies CSSProperties,
  scoreLabel: { fontSize: 11, color: "var(--text-muted)", textTransform: "uppercase" } satisfies CSSProperties,
  scoreValue: { fontSize: 24, fontWeight: 700 } satisfies CSSProperties,
  main: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  nameRow: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  name: { fontSize: 15, fontWeight: 700, overflowWrap: "anywhere" } satisfies CSSProperties,
  text: {
    margin: "6px 0 0",
    fontSize: 14,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  side: { display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 } satisfies CSSProperties,
  meta: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
