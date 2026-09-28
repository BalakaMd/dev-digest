import type { CSSProperties } from "react";

/** Co-located styles for ConventionsView — the Skills-lab page frame. */
export const s = {
  page: { padding: "28px 32px 44px", maxWidth: 1100, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 22 } satisfies CSSProperties,
  headerText: { flex: 1, minWidth: 0 } satisfies CSSProperties,
  h1: { fontSize: 26, fontWeight: 700, letterSpacing: "-0.02em" } satisfies CSSProperties,
  repo: { color: "var(--accent)", fontFamily: "var(--font-mono)", fontWeight: 600 } satisfies CSSProperties,
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 6 } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  acceptedCount: {
    marginLeft: "auto",
    fontSize: 13,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  hint: { fontSize: 13, color: "var(--text-muted)", marginBottom: 12 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
} as const;
