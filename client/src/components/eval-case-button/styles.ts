import type { CSSProperties } from "react";

/** Co-located styles for EvalCaseButton. */
export const s = {
  wrap: {
    display: "inline-flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 6,
    maxWidth: 320,
  } satisfies CSSProperties,
  hint: { fontSize: 12, overflowWrap: "anywhere", color: "var(--text-muted)" } satisfies CSSProperties,
  status: { fontSize: 12, overflowWrap: "anywhere", fontWeight: 600, color: "var(--ok)" } satisfies CSSProperties,
  existing: { fontSize: 12, overflowWrap: "anywhere", fontWeight: 600, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 12, overflowWrap: "anywhere", fontWeight: 600, color: "var(--crit)" } satisfies CSSProperties,
} as const;
