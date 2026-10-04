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
  risk: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    minWidth: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: "8px 0 8px 12px",
  } satisfies CSSProperties,
  riskHead: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  riskMain: { display: "flex", flexDirection: "column", gap: 2, flex: 1, minWidth: 0 } satisfies CSSProperties,
  riskIcon: (severity: "high" | "medium" | "low"): CSSProperties => ({
    flexShrink: 0,
    color: severity === "high" ? "var(--crit)" : severity === "medium" ? "var(--warn)" : "var(--text-muted)",
  }),
  riskToggle: {
    alignSelf: "stretch",
    display: "flex",
    alignItems: "center",
    padding: "0 12px",
    background: "none",
    border: "none",
    borderInlineStart: "1px solid var(--border)",
    cursor: "pointer",
    color: "inherit",
  } satisfies CSSProperties,
  chevron: (open: boolean): CSSProperties => ({
    flexShrink: 0,
    transform: open ? "rotate(180deg)" : "none",
    color: "var(--text-muted)",
  }),
  severity: { fontSize: 11, fontWeight: 600, textTransform: "uppercase", color: "var(--text-muted)" } satisfies CSSProperties,
  explanation: { fontSize: 13, margin: 0, paddingInlineEnd: 12, color: "var(--text-secondary, inherit)" } satisfies CSSProperties,
  refs: { display: "flex", flexWrap: "wrap", gap: 8, margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  link: { color: "var(--accent, inherit)", fontSize: 12, textDecoration: "underline", overflowWrap: "anywhere" } satisfies CSSProperties,
  focusItem: { display: "block", minWidth: 0, fontSize: 13, overflowWrap: "anywhere" } satisfies CSSProperties,
  focusMarker: { marginInlineEnd: 6, color: "var(--accent)", fontSize: 10 } satisfies CSSProperties,
  reason: { display: "inline", fontSize: 13, margin: 0, color: "var(--text-secondary, inherit)" } satisfies CSSProperties,
  count: { fontSize: 11, fontWeight: 600, padding: "1px 7px", borderRadius: 10, background: "var(--bg-hover)", color: "var(--text-secondary)" } satisfies CSSProperties,
};

/** Layout of the assembled block. */
export const layout = {
  block: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  status: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  summary: { margin: 0, fontSize: 14, lineHeight: 1.55, overflowWrap: "anywhere" } satisfies CSSProperties,
  summaryCard: { display: "flex", alignItems: "flex-start", gap: 12, border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", padding: 16, minWidth: 0 } satisfies CSSProperties,
  summaryBody: { display: "flex", flexDirection: "column", gap: 10, flex: 1, minWidth: 0 } satisfies CSSProperties,
  columns: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))", gap: 16, alignItems: "start" } satisfies CSSProperties,
  cell: { display: "flex", flexDirection: "column", gap: 16, minWidth: 0 } satisfies CSSProperties,
  panel: { border: "1px solid var(--border)", borderRadius: 8, background: "var(--bg-elevated)", padding: 16, minWidth: 0 } satisfies CSSProperties,
  skeleton: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
};
