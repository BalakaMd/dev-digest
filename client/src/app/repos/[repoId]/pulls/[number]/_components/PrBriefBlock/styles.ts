import type { CSSProperties } from "react";

/** Shared styles of the PR Brief sections. Visible focus comes from the global :focus-visible rule. */
export const s = {
  section: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  heading: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  wrap: { overflowWrap: "anywhere", minWidth: 0 } satisfies CSSProperties,
  row: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
  rowHead: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  toggle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "inherit",
    textAlign: "start",
    font: "inherit",
    minWidth: 0,
  } satisfies CSSProperties,
  /** RTL only: let the title take the free width so `text-align: start` reaches the right edge. */
  toggleGrow: { flex: "1 1 0" } satisfies CSSProperties,
  titleGrow: { flex: 1 } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    flexShrink: 0,
    transform: open ? "rotate(180deg)" : "none",
    color: "var(--text-muted)",
  }),
  severity: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  explanation: { fontSize: 13, margin: 0, color: "var(--text-secondary, inherit)" } satisfies CSSProperties,
  refs: { display: "flex", flexWrap: "wrap", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  link: { color: "var(--accent, inherit)", fontSize: 12, textDecoration: "underline", overflowWrap: "anywhere" } satisfies CSSProperties,
  focusItem: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  reason: { fontSize: 13, margin: 0 } satisfies CSSProperties,
};

/** Layout of the assembled block. */
export const layout = {
  block: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  status: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  summary: { margin: 0, fontSize: 14, lineHeight: 1.55, overflowWrap: "anywhere" } satisfies CSSProperties,
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16, alignItems: "start" } satisfies CSSProperties,
  cell: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  panel: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", padding: 16, minWidth: 0 } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
};
