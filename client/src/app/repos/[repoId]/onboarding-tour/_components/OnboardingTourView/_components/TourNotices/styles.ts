import type { CSSProperties } from "react";

const base = {
  display: "flex",
  alignItems: "flex-start",
  gap: 10,
  flexWrap: "wrap",
  padding: "10px 14px",
  borderRadius: 8,
  border: "1px solid var(--border)",
  background: "var(--bg-elevated)",
  fontSize: 14,
} satisfies CSSProperties;

export const s = {
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  notice: base satisfies CSSProperties,
  error: { ...base, borderColor: "var(--danger, #e5484d)" } satisfies CSSProperties,
  text: { flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  link: { textDecoration: "underline", color: "var(--accent)" } satisfies CSSProperties,
  meta: { color: "var(--text-secondary)", fontSize: 13 } satisfies CSSProperties,
};
