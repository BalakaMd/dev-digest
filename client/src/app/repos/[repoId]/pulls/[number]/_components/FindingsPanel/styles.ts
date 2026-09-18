import type { CSSProperties } from "react";

/** Co-located styles for FindingsPanel (extracted from inline styles). */
export const s = {
  counterRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  filterRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  // Never mix the `border` shorthand with a longhand here — React warns about it.
  filterButton: (active: boolean, color: string, bg: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "5px 12px",
    borderRadius: 6,
    borderWidth: 1,
    borderStyle: "solid",
    borderColor: active ? color : "var(--border)",
    background: active ? bg : "transparent",
    color: active ? color : "var(--text-secondary)",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all .12s",
  }),
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 16,
    flexWrap: "wrap",
  } satisfies CSSProperties,
  divider: {
    width: 1,
    height: 18,
    background: "var(--border)",
    margin: "0 2px",
  } satisfies CSSProperties,
  toggleGroup: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
} as const;
