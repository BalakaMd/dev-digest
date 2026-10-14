import type { CSSProperties } from "react";
import { toneBackground } from "../../../AgentMark";

export const s = {
  card: (checked: boolean, color: string): CSSProperties => ({
    display: "flex",
    alignItems: "flex-start",
    gap: 14,
    padding: "13px 16px",
    borderRadius: 10,
    border: `1px solid ${checked ? color : "var(--border)"}`,
    background: checked ? toneBackground(color, 8) : "var(--bg-elevated)",
    cursor: "pointer",
  }),
  box: (checked: boolean, color: string): CSSProperties => ({
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: 20,
    height: 20,
    padding: 0,
    borderRadius: 5,
    border: `1.5px solid ${checked ? color : "var(--border-strong)"}`,
    background: checked ? color : "transparent",
    color: "#fff",
    cursor: "pointer",
  }),
  body: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 15, fontWeight: 600, lineHeight: "20px", color: "var(--text-primary)" } satisfies CSSProperties,
  description: { fontSize: 13, lineHeight: 1.3, marginTop: 3, color: "var(--text-secondary)" } satisfies CSSProperties,
  meta: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: 2,
    flexShrink: 0,
    fontSize: 12,
    lineHeight: "20px",
    color: "var(--text-muted)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  metaMain: { fontFamily: "var(--font-mono)" } satisfies CSSProperties,
  metaRuns: { fontSize: 11, lineHeight: "14px" } satisfies CSSProperties,
} as const;
