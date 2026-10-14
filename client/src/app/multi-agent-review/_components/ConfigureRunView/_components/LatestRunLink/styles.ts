import type { CSSProperties } from "react";

export const s = {
  link: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    marginTop: 12,
    padding: "10px 14px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    textDecoration: "none",
    color: "inherit",
  } satisfies CSSProperties,
  icon: {
    display: "grid",
    placeItems: "center",
    flexShrink: 0,
    width: 32,
    height: 32,
    borderRadius: 8,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
  } satisfies CSSProperties,
  body: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  title: { fontSize: 14, fontWeight: 600, color: "var(--text-primary)" } satisfies CSSProperties,
  when: { fontSize: 12, marginTop: 1, color: "var(--text-muted)" } satisfies CSSProperties,
  arrow: { flexShrink: 0, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
