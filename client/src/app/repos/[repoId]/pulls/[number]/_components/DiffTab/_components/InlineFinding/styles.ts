import type { CSSProperties } from "react";

/**
 * All borders are set as longhand per-side properties (never `border`/
 * `borderColor` shorthand) — mixing a shorthand with a per-side override
 * warns on rerender (client/INSIGHTS.md:65-82).
 */
export const s = {
  card: (sevColor: string, muted: boolean): CSSProperties => ({
    borderTopWidth: 1,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    borderTopStyle: "solid",
    borderRightStyle: "solid",
    borderBottomStyle: "solid",
    borderLeftStyle: "solid",
    borderTopColor: "var(--border)",
    borderRightColor: "var(--border)",
    borderBottomColor: "var(--border)",
    borderLeftColor: sevColor,
    borderRadius: 6,
    background: "var(--bg-elevated)",
    margin: "6px 14px 8px 58px",
    opacity: muted ? 0.65 : 1,
  }),
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 10px",
    cursor: "pointer",
  } satisfies CSSProperties,
  title: (muted: boolean): CSSProperties => ({
    fontSize: 13,
    fontWeight: 600,
    flex: 1,
    minWidth: 0,
    color: "var(--text-primary)",
    textDecoration: muted ? "line-through" : "none",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  }),
  tag: {
    fontSize: 11,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: "0.04em",
    flexShrink: 0,
  } satisfies CSSProperties,
  severityWord: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
    flexShrink: 0,
  } satisfies CSSProperties,
  body: {
    padding: "0 10px 10px 10px",
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the finding is expanded. */
export function chevronFor(expanded: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: expanded ? "rotate(90deg)" : "none",
    transition: "transform .12s",
    flexShrink: 0,
  };
}
