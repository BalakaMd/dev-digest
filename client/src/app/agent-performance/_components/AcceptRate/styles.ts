import type { CSSProperties } from "react";
import type { AcceptTone } from "../../_model/accept-rate";

/* Tone → design token. Neutral/none use the muted text colour (AC-68). */
export function toneColor(tone: AcceptTone): string {
  switch (tone) {
    case "high":
      return "var(--ok)";
    case "medium":
      return "var(--warn)";
    case "low":
      return "var(--crit)";
    default:
      return "var(--text-muted)";
  }
}

export const s = {
  root: (tone: AcceptTone): CSSProperties => ({
    display: "inline-flex",
    alignItems: "baseline",
    flexWrap: "wrap",
    gap: 6,
    fontWeight: 600,
    color: toneColor(tone),
    position: "relative",
  }),
  decisions: { fontWeight: 400, color: "var(--text-secondary)" } satisfies CSSProperties,
  lowSample: {
    fontSize: 11,
    fontWeight: 500,
    color: "var(--text-secondary)",
    border: "1px solid var(--border)",
    borderRadius: 4,
    padding: "0 5px",
  } satisfies CSSProperties,
} as const;
