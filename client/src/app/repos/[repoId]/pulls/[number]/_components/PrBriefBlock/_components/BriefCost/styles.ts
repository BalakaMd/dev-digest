import type { CSSProperties } from "react";

export const s = {
  line: {
    display: "flex",
    alignItems: "baseline",
    justifyContent: "flex-end",
    gap: 8,
    margin: 0,
    fontFamily: "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)",
    fontSize: 12,
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  cost: { color: "var(--text-secondary)", fontWeight: 600 } satisfies CSSProperties,
};
