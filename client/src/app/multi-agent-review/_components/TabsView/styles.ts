import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  tablist: {
    display: "flex",
    gap: 4,
    flexWrap: "wrap",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  tab: (selected: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    padding: "10px 14px",
    fontSize: 14,
    fontWeight: selected ? 700 : 500,
    color: selected ? "var(--text-primary)" : "var(--text-secondary)",
    background: "transparent",
    border: "none",
    borderBottom: `2px solid ${selected ? "var(--accent, var(--text-primary))" : "transparent"}`,
    marginBottom: -1,
    cursor: "pointer",
    maxWidth: 260,
  }),
  tabName: {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  tabValue: { fontWeight: 700, flexShrink: 0 } satisfies CSSProperties,
  panel: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  empty: { fontSize: 14, color: "var(--text-muted)", padding: "8px 0" } satisfies CSSProperties,
} as const;
