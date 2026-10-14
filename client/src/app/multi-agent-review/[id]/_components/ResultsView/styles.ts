import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1400, margin: "0 auto" } satisfies CSSProperties,
  header: { marginBottom: 20 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  h1: { fontSize: 22, fontWeight: 700, letterSpacing: "-0.02em", minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  actions: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 18,
    flexWrap: "wrap",
    marginTop: 8,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  metaLabel: { color: "var(--text-muted)", marginRight: 6 } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", marginLeft: 6 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 24 } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  link: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 14,
    fontWeight: 600,
    color: "var(--accent)",
    cursor: "pointer",
  } satisfies CSSProperties,
  skeleton: {
    height: 120,
    borderRadius: 10,
    background: "var(--bg-surface)",
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
