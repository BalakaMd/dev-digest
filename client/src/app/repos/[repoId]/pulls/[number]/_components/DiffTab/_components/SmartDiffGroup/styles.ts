import type { CSSProperties } from "react";

export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    padding: "8px 4px",
    cursor: "pointer",
    // Sticky (S6): stays pinned to the top of the scroll container while its
    // files scroll underneath, opaque so file cards don't show through.
    // Offset by `--pr-header-h` (published by PrDetailHeader, itself sticky
    // at top:0 in the same scroll container — AppShell's <main>) so this
    // header sticks just below it instead of underneath it.
    position: "sticky",
    top: "var(--pr-header-h, 0px)",
    zIndex: 2,
    background: "var(--bg-primary)",
  } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  right: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // Danger token, not accent — a non-zero count is a warning signal.
  dot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    background: "var(--crit)",
    display: "inline-block",
  } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;

/** Chevron rotates 90deg when the group is open. */
export function chevronFor(open: boolean): CSSProperties {
  return {
    color: "var(--text-muted)",
    transform: open ? "rotate(90deg)" : "none",
    transition: "transform .12s",
  };
}
