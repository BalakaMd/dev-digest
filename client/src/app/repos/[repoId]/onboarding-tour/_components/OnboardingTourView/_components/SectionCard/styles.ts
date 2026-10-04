import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 12,
    background: "var(--bg-elevated)",
    padding: "16px 20px 20px",
    scrollMarginTop: 16,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  iconBox: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    borderRadius: 8,
    background: "var(--bg-hover)",
    color: "var(--accent-text)",
    flexShrink: 0,
  } satisfies CSSProperties,
  title: { flex: 1, margin: 0, fontSize: 17, fontWeight: 600, outline: "none" } satisfies CSSProperties,
  toggle: {
    display: "inline-flex",
    padding: 6,
    border: 0,
    background: "transparent",
    color: "var(--text-secondary)",
    cursor: "pointer",
    borderRadius: 6,
  } satisfies CSSProperties,
  flip: { transform: "rotate(180deg)" } satisfies CSSProperties,
  body: { marginTop: 16, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
};
