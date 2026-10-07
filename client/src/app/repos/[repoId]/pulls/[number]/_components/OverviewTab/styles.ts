import type { CSSProperties } from "react";

export const s = {
  cards: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(420px, 1fr))",
    gap: 16,
    alignItems: "start",
    marginBottom: 24,
  } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    padding: "8px 12px",
    border: "1px solid var(--border-strong)",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  noticeHidden: { position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" } satisfies CSSProperties,
  cell: { minWidth: 0 } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
