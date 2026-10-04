import type { CSSProperties } from "react";

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  task: { display: "flex", flexDirection: "column", gap: 8, minWidth: 0 } satisfies CSSProperties,
  description: { fontSize: 14, overflowWrap: "anywhere", textAlign: "start" } satisfies CSSProperties,
  paths: { display: "flex", flexDirection: "column", gap: 6, minWidth: 0 } satisfies CSSProperties,
};
