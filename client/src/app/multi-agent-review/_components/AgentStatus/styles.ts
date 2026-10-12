import type { CSSProperties } from "react";

/** Co-located styles for AgentStatus. Status is always icon + text, never colour only. */
export const s = {
  root: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 500,
  } satisfies CSSProperties,
  pulse: { animation: "ddpulse 1.4s ease-in-out infinite" } satisfies CSSProperties,
  color: {
    running: "var(--accent-text)",
    done: "var(--ok)",
    failed: "var(--crit)",
    cancelled: "var(--text-muted)",
  },
} as const;
