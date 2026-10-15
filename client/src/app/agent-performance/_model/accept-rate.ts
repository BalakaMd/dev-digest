/* Accept-rate colour rules (AC-68, AC-14). Rates are fractions 0..1, compared unrounded. */
import { ACCEPT_HIGH, ACCEPT_MEDIUM } from "./constants";

export type AcceptTone = "high" | "medium" | "low" | "neutral" | "none";

export interface AcceptLike {
  rate: number | null;
  low_sample: boolean;
}

/** `none` = no rate, `neutral` = low sample, else green/amber/red by the unrounded value. */
export function acceptTone(accept: AcceptLike): AcceptTone {
  if (accept.rate == null) return "none";
  if (accept.low_sample) return "neutral";
  if (accept.rate >= ACCEPT_HIGH) return "high";
  if (accept.rate >= ACCEPT_MEDIUM) return "medium";
  return "low";
}

/** Message key (under `accept.`) of the quality description; null for neutral/none. */
export function acceptDescriptionKey(tone: AcceptTone): "high" | "medium" | "low" | null {
  return tone === "high" || tone === "medium" || tone === "low" ? tone : null;
}

/** Whole percentage shown to the user. */
export function wholePercent(rate: number): number {
  return Math.round(rate * 100);
}
