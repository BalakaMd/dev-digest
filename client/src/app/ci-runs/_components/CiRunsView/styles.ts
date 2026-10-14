import type { CSSProperties } from "react";

/** Co-located styles for CiRunsView and CiRunDetails. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1200, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 } satisfies CSSProperties,
  headerText: { flex: 1 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  notice: {
    padding: "10px 14px",
    marginBottom: 14,
    borderRadius: 8,
    border: "1px solid var(--border-strong)",
    background: "var(--bg-hover)",
    fontSize: 13,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  more: { display: "flex", justifyContent: "center", marginTop: 14 } satisfies CSSProperties,
  link: { color: "var(--accent)", fontWeight: 600 } satisfies CSSProperties,
  section: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: "18px 0 8px",
  } satisfies CSSProperties,
  dl: { display: "grid", gridTemplateColumns: "max-content 1fr", gap: "6px 16px", fontSize: 13, margin: 0 } satisfies CSSProperties,
  dt: { color: "var(--text-secondary)" } satisfies CSSProperties,
  dd: { margin: 0, wordBreak: "break-all" } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
} as const;
