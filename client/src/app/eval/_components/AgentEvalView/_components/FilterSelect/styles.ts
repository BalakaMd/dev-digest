import type { CSSProperties } from "react";

/** Co-located styles for FilterSelect. */
export const s = {
  wrap: { position: "relative", display: "inline-flex", alignItems: "center" } satisfies CSSProperties,
  select: {
    appearance: "none",
    WebkitAppearance: "none",
    padding: "7px 32px 7px 10px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-elevated)",
    color: "var(--text-primary)",
    fontSize: 13.5,
    cursor: "pointer",
  } satisfies CSSProperties,
  icon: { position: "absolute", right: 10, color: "var(--text-muted)", pointerEvents: "none" } satisfies CSSProperties,
};
