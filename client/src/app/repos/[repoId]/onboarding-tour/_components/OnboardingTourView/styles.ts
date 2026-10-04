import type { CSSProperties } from "react";

export const s = {
  page: { display: "flex", minHeight: "100%", alignItems: "flex-start" } satisfies CSSProperties,
  aside: {
    width: 260,
    flexShrink: 0,
    padding: "32px 20px",
    position: "sticky",
    top: 0,
  } satisfies CSSProperties,
  main: {
    flex: 1,
    minWidth: 0,
    maxWidth: 1100,
    padding: "32px 32px 64px",
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  sections: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  skeletons: { display: "flex", flexDirection: "column", gap: 12, padding: 32, flex: 1 } satisfies CSSProperties,
  progress: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 12,
    padding: "60px 28px",
    textAlign: "center",
  } satisfies CSSProperties,
  progressBody: { color: "var(--text-secondary)", maxWidth: 480 } satisfies CSSProperties,
};
