import type { CSSProperties } from "react";

export const s = {
  wrap: {
    display: "flex",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 6,
    marginTop: 12,
  } satisfies CSSProperties,
  label: { fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 5,
    fontSize: 12,
    color: "var(--text-secondary)",
    background: "var(--bg-hover)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "2px 7px",
    cursor: "pointer",
  } satisfies CSSProperties,
};
