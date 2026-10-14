import type { CSSProperties } from "react";

export const s = {
  group: {
    display: "inline-flex",
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "hidden",
  } satisfies CSSProperties,
  button: {
    padding: "5px 14px",
    fontSize: 13,
    fontWeight: 500,
    border: "none",
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
  } satisfies CSSProperties,
  buttonActive: {
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    fontWeight: 600,
  } satisfies CSSProperties,
} as const;
