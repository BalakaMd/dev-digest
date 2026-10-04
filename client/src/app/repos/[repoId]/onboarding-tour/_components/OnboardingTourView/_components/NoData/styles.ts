import type { CSSProperties } from "react";

export const s = {
  root: { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 } satisfies CSSProperties,
  text: { color: "var(--text-secondary)", fontSize: 13.5 } satisfies CSSProperties,
};
