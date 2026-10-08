import type { CSSProperties } from "react";

/** Co-located styles for one eval case row. */
export const s = {
  row: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  status: (state: "passed" | "failed" | "never"): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    minWidth: 92,
    fontSize: 12.5,
    fontWeight: 600,
    color: state === "passed" ? "var(--ok)" : state === "failed" ? "var(--crit)" : "var(--text-muted)",
  }),
  main: { flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  name: { fontSize: 14, fontWeight: 600, overflowWrap: "anywhere" } satisfies CSSProperties,
  where: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  file: { overflowWrap: "anywhere" } satisfies CSSProperties,
  actions: { display: "flex", gap: 4 } satisfies CSSProperties,
} as const;
