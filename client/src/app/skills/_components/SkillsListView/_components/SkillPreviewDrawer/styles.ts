import type { CSSProperties } from "react";

/** Co-located styles for SkillPreviewDrawer. */
export const s = {
  body: { padding: "18px 24px 28px", display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  badges: { display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" } satisfies CSSProperties,
  notice: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  sectionTitle: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 8,
  } satisfies CSSProperties,
  description: { fontSize: 14, lineHeight: 1.5 } satisfies CSSProperties,
  agents: { display: "flex", gap: 6, flexWrap: "wrap" } satisfies CSSProperties,
  muted: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  markdown: {
    fontSize: 14,
    padding: "14px 16px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
  } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
