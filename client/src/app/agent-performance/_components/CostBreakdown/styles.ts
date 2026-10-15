import type { CSSProperties } from "react";

export const s = {
  section: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  title: {
    margin: 0,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.1em",
    textTransform: "uppercase",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  grid: { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 16 } satisfies CSSProperties,
  panel: {
    padding: "16px 20px 20px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minWidth: 0,
  } satisfies CSSProperties,
  panelTitle: { margin: "0 0 14px", fontSize: 13, fontWeight: 500, color: "var(--text-secondary)" } satisfies CSSProperties,
  body: { display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap" } satisfies CSSProperties,
  legend: { margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8, fontSize: 13, minWidth: 0, flex: "1 1 180px" } satisfies CSSProperties,
  legendRow: { display: "flex", alignItems: "center", flexWrap: "wrap", columnGap: 10, rowGap: 2, minWidth: 0 } satisfies CSSProperties,
  swatch: (color: string): CSSProperties => ({ width: 9, height: 9, borderRadius: 2, background: color, flexShrink: 0 }),
  legendName: {
    color: "var(--text-secondary)",
    flex: "1 1 96px",
    minWidth: 96,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  legendAmount: { whiteSpace: "nowrap", textAlign: "right", minWidth: 56, color: "var(--text-primary)", fontWeight: 600, fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  legendPercent: { color: "var(--text-muted)", fontVariantNumeric: "tabular-nums", minWidth: 36, textAlign: "right" } satisfies CSSProperties,
  empty: {
    margin: 0,
    padding: "20px",
    borderRadius: 10,
    border: "1px dashed var(--border)",
    color: "var(--text-secondary)",
    fontSize: 14,
  } satisfies CSSProperties,
} as const;
