import type { CSSProperties } from "react";

export const s = {
  nav: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  title: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-tertiary)",
  } satisfies CSSProperties,
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column" } satisfies CSSProperties,
  link: (active: boolean): CSSProperties => ({
    display: "block",
    padding: "8px 14px",
    fontSize: 14,
    textDecoration: "none",
    color: active ? "var(--text-primary)" : "var(--text-secondary)",
    fontWeight: active ? 600 : 400,
    borderInlineStart: `2px solid ${active ? "var(--accent-text)" : "transparent"}`,
  }),
};
