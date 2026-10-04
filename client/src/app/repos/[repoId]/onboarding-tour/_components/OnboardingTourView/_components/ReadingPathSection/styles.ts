import type { CSSProperties } from "react";

export const s = {
  list: { listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  item: { minWidth: 0 } satisfies CSSProperties,
};
