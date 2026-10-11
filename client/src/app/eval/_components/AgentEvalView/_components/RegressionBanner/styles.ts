import type { CSSProperties } from "react";

/** Co-located styles for RegressionBanner. */
export const s = {
  banner: {
    display: "flex",
    gap: 12,
    alignItems: "flex-start",
    padding: "12px 16px",
    borderRadius: 10,
    border: "1px solid var(--warn, #d9a441)",
    background: "color-mix(in srgb, var(--warn, #d9a441) 10%, transparent)",
    fontSize: 14,
    marginBottom: 16,
  } satisfies CSSProperties,
  icon: { color: "var(--warn, #d9a441)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  body: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  muted: { color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
