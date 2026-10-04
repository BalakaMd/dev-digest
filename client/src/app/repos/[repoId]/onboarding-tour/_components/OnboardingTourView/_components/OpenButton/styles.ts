import type { CSSProperties } from "react";

export const s = {
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 9px",
    fontSize: 12.5,
    fontWeight: 500,
    borderRadius: 6,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    textDecoration: "none",
    whiteSpace: "nowrap",
    flexShrink: 0,
  } satisfies CSSProperties,
};
