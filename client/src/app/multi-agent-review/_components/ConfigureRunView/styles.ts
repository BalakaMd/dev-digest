import type { CSSProperties } from "react";

export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 900, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4, marginBottom: 24 } satisfies CSSProperties,
  step: { marginBottom: 24 } satisfies CSSProperties,
  stepHead: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 } satisfies CSSProperties,
  stepTitle: {
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  link: {
    background: "none",
    border: "none",
    padding: 0,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--accent)",
    cursor: "pointer",
  } satisfies CSSProperties,
  message: { fontSize: 14, color: "var(--text-secondary)" } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" } satisfies CSSProperties,
  summary: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  note: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  srOnly: {
    position: "absolute",
    width: 1,
    height: 1,
    overflow: "hidden",
    clip: "rect(0 0 0 0)",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
} as const;
