import type { CSSProperties } from "react";

export const s = {
  root: {
    position: "sticky",
    top: 0,
    zIndex: 5,
    background: "var(--bg-primary)",
    borderBottom: "1px solid var(--border)",
    padding: "18px 32px 0",
  } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "flex-start",
    gap: 18,
  } satisfies CSSProperties,
  titleCol: {
    flex: 1,
    minWidth: 0,
  } satisfies CSSProperties,
  h1: {
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    display: "flex",
    alignItems: "center",
    gap: 12,
  } satisfies CSSProperties,
  prNumber: {
    fontSize: 18,
    color: "var(--text-muted)",
    fontWeight: 500,
  } satisfies CSSProperties,
  meta: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    marginTop: 10,
    marginBottom: 14,
    fontSize: 13,
    color: "var(--text-secondary)",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  authorChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
  } satisfies CSSProperties,
  branchChip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
  } satisfies CSSProperties,
  branchMono: {
    fontSize: 12,
  } satisfies CSSProperties,
  actions: {
    display: "flex",
    gap: 10,
    flexShrink: 0,
  } satisfies CSSProperties,
  /* Link styled as a small Button: accent-tinted so it reads as a shortcut
     into the run results, not another neutral action. */
  latestRun: (hover: boolean): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 7,
    padding: "5px 11px",
    fontSize: 12.5,
    fontWeight: 500,
    lineHeight: 1.2,
    letterSpacing: "-0.01em",
    whiteSpace: "nowrap",
    textDecoration: "none",
    borderRadius: 6,
    color: "var(--accent-text)",
    background: "var(--accent-bg)",
    border: `1px solid ${hover ? "var(--accent)" : "transparent"}`,
    transition: "border-color .12s, background .12s",
  }),
  staleBanner: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 12,
    fontSize: 12.5,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
