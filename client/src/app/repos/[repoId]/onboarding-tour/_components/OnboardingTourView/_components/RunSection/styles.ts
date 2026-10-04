import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  toolbar: { display: "flex" } satisfies CSSProperties,
  empty: { color: "var(--text-secondary)", fontSize: 13.5 } satisfies CSSProperties,
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  item: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  number: { color: "var(--text-secondary)", fontWeight: 600, minWidth: 20, flexShrink: 0 } satisfies CSSProperties,
  command: {
    flex: 1,
    minWidth: 0,
    padding: "6px 10px",
    fontSize: 13,
    borderRadius: 6,
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    whiteSpace: "pre-wrap",
    userSelect: "text",
  } satisfies CSSProperties,
};
