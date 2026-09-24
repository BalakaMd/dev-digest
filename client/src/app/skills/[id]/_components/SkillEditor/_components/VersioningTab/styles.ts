import type { CSSProperties } from "react";
import type { DiffLine } from "./line-diff";

/** Co-located styles for VersioningTab. */
export const s = {
  titleRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  title: { fontSize: 17, fontWeight: 700 } satisfies CSSProperties,
  subtitle: { fontSize: 13, color: "var(--text-muted)", margin: "8px 0 18px", lineHeight: 1.5 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: (current: boolean): CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid " + (current ? "var(--accent)" : "var(--border)"),
    background: current ? "var(--accent-bg)" : "var(--bg-elevated)",
  }),
  versionBadge: { fontSize: 13, fontWeight: 700, minWidth: 34 } satisfies CSSProperties,
  date: { fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  stat: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  diff: {
    margin: "6px 0 4px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-surface)",
    overflow: "hidden",
  } satisfies CSSProperties,
  diffTitle: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
    padding: "8px 12px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  diffEmpty: { fontSize: 13, color: "var(--text-muted)", padding: "10px 12px" } satisfies CSSProperties,
  diffBody: { fontSize: 12, lineHeight: 1.6, padding: "6px 0", maxHeight: 420, overflow: "auto" } satisfies CSSProperties,
  diffLine: (kind: DiffLine["kind"]): CSSProperties => ({
    padding: "0 12px",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    color: kind === "add" ? "var(--ok)" : kind === "remove" ? "var(--crit)" : "var(--text-secondary)",
    background: kind === "add" ? "var(--ok-bg)" : kind === "remove" ? "var(--crit-bg)" : "transparent",
  }),
} as const;
