import type { CSSProperties } from "react";
import { toneBackground } from "../../../AgentMark";

export const s = {
  card: (checked: boolean, color: string): CSSProperties => ({
    display: "flex",
    flexDirection: "column",
    gap: 4,
    padding: "12px 14px",
    borderRadius: 8,
    border: `1px solid ${checked ? color : "var(--border)"}`,
    background: checked ? toneBackground(color) : "var(--bg-surface)",
  }),
  head: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 } satisfies CSSProperties,
  title: { display: "flex", alignItems: "center", gap: 10, minWidth: 0 } satisfies CSSProperties,
  meta: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0, fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  description: { fontSize: 13, color: "var(--text-secondary)", paddingLeft: 30 } satisfies CSSProperties,
} as const;
