import type { CSSProperties } from "react";

/** Co-located styles for SkillFields. */
export const s = {
  fields: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  tokens: { fontSize: 11, fontWeight: 500, color: "var(--text-muted)" } satisfies CSSProperties,
  body: {
    width: "100%",
    resize: "vertical",
    fontSize: 12.5,
    lineHeight: 1.55,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-surface)",
    color: "var(--text-primary)",
    outline: "none",
  } satisfies CSSProperties,
} as const;
