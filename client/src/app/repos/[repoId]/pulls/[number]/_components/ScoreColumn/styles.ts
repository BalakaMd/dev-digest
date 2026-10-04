import type { CSSProperties } from "react";

/** Shared by the verdict card and the brief-only card so both columns have identical spacing. */
export const s = {
  col: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: 5,
    width: 118,
    flexShrink: 0,
    alignSelf: "stretch",
  } satisfies CSSProperties,
  ring: {
    boxSizing: "border-box",
    width: 52,
    height: 52,
    borderRadius: "50%",
    border: "5px solid var(--border)",
    display: "grid",
    placeItems: "center",
    fontSize: 16,
    fontWeight: 600,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  label: { fontSize: 12, color: "var(--text-muted)", letterSpacing: "0.04em" } satisfies CSSProperties,
  meta: {
    alignSelf: "stretch",
    marginTop: "auto",
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  metaSpacer: { marginTop: 6 } satisfies CSSProperties,
  action: { flexShrink: 0, alignSelf: "flex-start" } satisfies CSSProperties,
} as const;
