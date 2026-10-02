import type { CSSProperties } from "react";

/** Co-located styles for PriorPrsAccordion. Border sides are set explicitly (client INSIGHTS 2026-09-19). */
export const s = {
  root: {
    marginTop: 14,
    borderTopWidth: 1,
    borderTopStyle: "solid",
    borderTopColor: "var(--border)",
    paddingTop: 10,
  } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: 0,
    background: "transparent",
    border: "none",
    cursor: "pointer",
    fontSize: 12.5,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  body: { marginTop: 10, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  text: { fontSize: 12.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
  errorText: { fontSize: 12.5, color: "var(--crit)", margin: 0 } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 4, fontSize: 12.5 } satisfies CSSProperties,
  titleLine: { fontWeight: 600, color: "var(--text-primary)", overflowWrap: "anywhere" } satisfies CSSProperties,
  link: { color: "var(--accent)", textDecoration: "none" } satisfies CSSProperties,
  meta: { color: "var(--text-secondary)", fontSize: 12 } satisfies CSSProperties,
  files: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 } satisfies CSSProperties,
  file: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 11.5,
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  notes: { color: "var(--text-tertiary, var(--text-secondary))", fontSize: 12, margin: 0 } satisfies CSSProperties,
};
