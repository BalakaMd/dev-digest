import type { CSSProperties } from "react";

/** Co-located styles for SkillEditor. */
export const s = {
  wrap: { maxWidth: 980, margin: "0 auto", width: "100%" } satisfies CSSProperties,
  header: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "20px 28px 12px",
    flexWrap: "wrap",
  } satisfies CSSProperties,
  name: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  enabled: {
    marginLeft: "auto",
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  tabsBar: { borderBottom: "1px solid var(--border)" } satisfies CSSProperties,
  body: { padding: "24px 28px 48px" } satisfies CSSProperties,
} as const;
