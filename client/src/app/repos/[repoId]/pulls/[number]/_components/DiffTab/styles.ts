import type { CSSProperties } from "react";

export const s = {
  toolbar: { display: "flex", alignItems: "center", gap: 8 } satisfies CSSProperties,
  groupsWrap: { display: "flex", flexDirection: "column", gap: 18 } satisfies CSSProperties,
  hint: {
    fontSize: 12.5,
    color: "var(--text-muted)",
    margin: "-6px 0 12px",
  } satisfies CSSProperties,
  /** Dot next to a file's path marking "this file has findings" (FileCard
      header, via `annotations.marker`) — distinct from the GitHub comment
      counter (FileCard.tsx:67-74). Uses the danger token, not the accent
      colour — a finding is a warning signal, not a neutral highlight. */
  fileMarker: {
    width: 6,
    height: 6,
    borderRadius: "50%",
    background: "var(--crit)",
    display: "inline-block",
    flexShrink: 0,
  } satisfies CSSProperties,
  /** The severity-label pill rendered at a decorated code line's right edge —
      sized down from `Badge`'s default so it fits a 20px line. */
  lineDecorBadge: {
    fontSize: 10,
    padding: "1px 6px",
    lineHeight: 1.3,
  } satisfies CSSProperties,
} as const;
