import type { CSSProperties } from "react";

/** Co-located styles for AgentEvalView. */
export const s = {
  page: { padding: "24px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  back: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 14,
    color: "var(--text-secondary)",
    textDecoration: "none",
    marginBottom: 14,
  } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, flexWrap: "wrap", marginBottom: 8 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 240 } satisfies CSSProperties,
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h1: { fontSize: 24, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 } satisfies CSSProperties,
  controls: { display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" } satisfies CSSProperties,
  statusRow: { display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 12, minHeight: 20, marginBottom: 12 } satisfies CSSProperties,
  reason: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  status: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  error: { fontSize: 12.5, color: "var(--crit)", fontWeight: 600 } satisfies CSSProperties,
  loading: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  block: { marginBottom: 20 } satisfies CSSProperties,
} as const;
