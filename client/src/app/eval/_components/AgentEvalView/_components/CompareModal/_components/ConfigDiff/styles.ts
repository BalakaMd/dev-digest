import type { CSSProperties } from "react";

/** Co-located styles for ConfigDiff. */
export const s = {
  root: { display: "flex", flexDirection: "column", gap: 14 } satisfies CSSProperties,
  heading: {
    fontSize: 11.5,
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    margin: 0,
  } satisfies CSSProperties,
  legend: { display: "flex", gap: 16, fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  pre: {
    margin: 0,
    padding: "12px 0",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-primary)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 13,
    lineHeight: 1.6,
    overflowX: "auto",
  } satisfies CSSProperties,
  line: (kind: "same" | "add" | "del"): CSSProperties => ({
    display: "block",
    padding: "0 16px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    background:
      kind === "add"
        ? "color-mix(in srgb, var(--ok) 14%, transparent)"
        : kind === "del"
          ? "color-mix(in srgb, var(--crit) 14%, transparent)"
          : "transparent",
  }),
  marker: { display: "inline-block", width: "1.5em", color: "var(--text-muted)", userSelect: "none" } satisfies CSSProperties,
  row: { display: "flex", gap: 8, fontSize: 13.5, alignItems: "baseline", flexWrap: "wrap" } satisfies CSSProperties,
  label: { color: "var(--text-muted)", minWidth: 120 } satisfies CSSProperties,
  mono: { fontFamily: "var(--font-mono, monospace)" } satisfies CSSProperties,
  muted: { fontSize: 13.5, color: "var(--text-secondary)", margin: 0 } satisfies CSSProperties,
} as const;
