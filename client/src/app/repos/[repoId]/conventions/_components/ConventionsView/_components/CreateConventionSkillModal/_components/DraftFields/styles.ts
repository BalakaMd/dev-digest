import type { CSSProperties } from "react";

/** Co-located styles for DraftFields. */
export const s = {
  row: { display: "flex", gap: 20 } satisfies CSSProperties,
  col: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  toggle: { height: 38, display: "flex", alignItems: "center" } satisfies CSSProperties,
} as const;
