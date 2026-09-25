import type { CSSProperties } from "react";

const LINE_HEIGHT = 20;
const PAD_Y = 10;

/** Co-located styles for SkillBodyEditor. Gutter and textarea share one line height. */
export const s = {
  frame: {
    border: "1px solid var(--border-strong)",
    borderRadius: 8,
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  fileIcon: { color: "var(--text-muted)" } satisfies CSSProperties,
  fileName: { fontSize: 12.5, fontWeight: 600 } satisfies CSSProperties,
  unsaved: {
    fontSize: 11,
    padding: "1px 7px",
    borderRadius: 5,
    background: "var(--bg-hover)",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  tokens: { marginLeft: "auto", fontSize: 11, color: "var(--text-muted)" } satisfies CSSProperties,
  body: { display: "flex", alignItems: "stretch" } satisfies CSSProperties,
  gutter: (rows: number): CSSProperties => ({
    flexShrink: 0,
    minWidth: 38,
    maxHeight: rows * LINE_HEIGHT + PAD_Y * 2,
    overflow: "hidden",
    padding: `${PAD_Y}px 8px ${PAD_Y}px 10px`,
    textAlign: "right",
    userSelect: "none",
    fontFamily: "var(--font-mono)",
    fontSize: 12,
    lineHeight: `${LINE_HEIGHT}px`,
    color: "var(--text-muted)",
    borderRight: "1px solid var(--border)",
  }),
  lineNo: { height: LINE_HEIGHT } satisfies CSSProperties,
  textarea: {
    flex: 1,
    minWidth: 0,
    resize: "vertical",
    border: "none",
    outline: "none",
    background: "transparent",
    color: "var(--text-primary)",
    fontSize: 12.5,
    lineHeight: `${LINE_HEIGHT}px`,
    padding: `${PAD_Y}px 12px`,
    whiteSpace: "pre",
    overflowX: "auto",
  } satisfies CSSProperties,
} as const;
