import type { CSSProperties } from "react";

export const s = {
  row: { display: "flex", flexDirection: "column", gap: 4, minWidth: 0 } satisfies CSSProperties,
  head: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, minWidth: 0 } satisfies CSSProperties,
  leading: { color: "var(--text-secondary)", fontWeight: 600, minWidth: 20 } satisfies CSSProperties,
  path: { fontSize: 13, minWidth: 0, flex: "0 1 auto" } satisfies CSSProperties,
  reason: {
    fontSize: 13.5,
    color: "var(--text-secondary)",
    overflowWrap: "anywhere",
    textAlign: "start",
  } satisfies CSSProperties,
};
