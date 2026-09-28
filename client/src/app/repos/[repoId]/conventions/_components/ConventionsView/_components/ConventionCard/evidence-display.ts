/* evidence-display.ts — how a candidate's evidence and confidence are shown. */
import type { ConventionEvidence } from "@devdigest/shared";

/** `path:12` or `path:12-18`. */
export function evidenceRef(e: Pick<ConventionEvidence, "path" | "line_start" | "line_end">): string {
  return e.line_start === e.line_end ? `${e.path}:${e.line_start}` : `${e.path}:${e.line_start}-${e.line_end}`;
}

/** Same thresholds as the kit's ConfidenceNum: ≥85% ok, ≥65% warn, else crit. */
export function confidenceColor(confidence: number): string {
  if (confidence >= 0.85) return "var(--ok)";
  if (confidence >= 0.65) return "var(--warn)";
  return "var(--crit)";
}

export function confidencePercent(confidence: number): number {
  return Math.round(confidence * 100);
}
