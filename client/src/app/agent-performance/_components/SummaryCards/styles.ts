import type { CSSProperties } from "react";

const card = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  minWidth: 0,
  padding: "16px 18px",
  borderRadius: 10,
  border: "1px solid var(--border)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  textAlign: "left",
} satisfies CSSProperties;

export const s = {
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 16,
  } satisfies CSSProperties,
  card,
  cardButton: {
    ...card,
    font: "inherit",
    cursor: "pointer",
    width: "100%",
  } satisfies CSSProperties,
  head: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 } satisfies CSSProperties,
  label: {
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  valueRow: { display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" } satisfies CSSProperties,
  value: { fontSize: 30, fontWeight: 700, lineHeight: 1.1 } satisfies CSSProperties,
  unit: { fontSize: 16, fontWeight: 500, color: "var(--text-secondary)" } satisfies CSSProperties,
  delta: (tone: "down" | "up" | "flat"): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    color: tone === "down" ? "var(--ok)" : tone === "up" ? "var(--warn)" : "var(--text-secondary)",
  }),
  muted: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  sources: { display: "flex", flexDirection: "column", gap: 2, fontSize: 12, color: "var(--text-secondary)", margin: 0, padding: 0, listStyle: "none" } satisfies CSSProperties,
  warn: { fontSize: 12, fontWeight: 600, color: "var(--warn)" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)", margin: 0 } satisfies CSSProperties,
  sparkline: { width: "100%", height: 48, display: "block", color: "var(--accent)" } satisfies CSSProperties,
  ring: { flexShrink: 0 } satisfies CSSProperties,
  agentRow: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  agentText: { display: "flex", flexDirection: "column", gap: 2, minWidth: 0 } satisfies CSSProperties,
  agentName: {
    fontSize: 16,
    fontWeight: 700,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  agentMeta: { fontSize: 12, color: "var(--text-secondary)", display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
} as const;
