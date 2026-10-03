import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView — two-pane page frame. */
export const s = {
  page: {
    display: "flex",
    height: "100%",
    minHeight: 0,
  } satisfies CSSProperties,
  left: {
    width: 260,
    flexShrink: 0,
    display: "flex",
    flexDirection: "column",
    borderRight: "1px solid var(--border)",
    background: "var(--bg-surface)",
    minHeight: 0,
  } satisfies CSSProperties,
  right: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  } satisfies CSSProperties,
  centered: { padding: 24, flex: 1 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 10, padding: 16 } satisfies CSSProperties,
  banner: {
    margin: "8px 12px",
    padding: "8px 10px",
    borderRadius: 7,
    border: "1px solid var(--crit)",
    color: "var(--text-primary)",
    fontSize: 12.5,
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  notice: { margin: "6px 14px", fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  live: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
