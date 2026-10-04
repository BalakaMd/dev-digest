import type { CSSProperties } from "react";

export const s = {
  root: { fontSize: 14.5, lineHeight: 1.65, color: "var(--text-secondary)" } satisfies CSSProperties,
  p: { margin: "0 0 10px" } satisfies CSSProperties,
  strong: { fontWeight: 650, color: "var(--text-primary)" } satisfies CSSProperties,
  code: {
    fontSize: "0.92em",
    padding: "1px 6px",
    borderRadius: 4,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
    unicodeBidi: "isolate",
  } satisfies CSSProperties,
};
