import type { CSSProperties } from "react";

export const s = {
  stack: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  notice: {
    margin: 0,
    fontSize: 13,
    padding: "8px 12px",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
  } satisfies CSSProperties,
  link: { color: "var(--accent)", textDecoration: "underline" } satisfies CSSProperties,
  title: { margin: "0 0 4px", fontSize: 12, fontWeight: 600, color: "var(--text-muted)" } satisfies CSSProperties,
  list: { margin: 0, paddingInlineStart: 18, fontSize: 13, color: "var(--text-secondary)", overflowWrap: "anywhere" } satisfies CSSProperties,
};
