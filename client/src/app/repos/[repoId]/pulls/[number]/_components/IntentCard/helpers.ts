/* Pure display rules for IntentCard: confidence → colour, and splitting the
   derivation sources into the ones that were actually used and the ones that
   were not (unreachable / unsupported / skipped), so the unavailable ones can
   be called out separately. Framework-free — no React imports. */
import type { IntentConfidence, IntentSource, IntentSourceStatus } from "@devdigest/shared";

export const CONFIDENCE_COLOR: Record<IntentConfidence, { color: string; bg: string }> = {
  high: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  // "muted-danger": low confidence is a caution, not an error — muted text on
  // the danger-tinted background reads as "be careful" rather than "broken".
  low: { color: "var(--text-muted)", bg: "var(--crit-bg)" },
};

const UNAVAILABLE_STATUSES: ReadonlySet<IntentSourceStatus> = new Set([
  "unreachable",
  "unsupported",
  "skipped",
]);

export function isSourceUnavailable(source: IntentSource): boolean {
  return UNAVAILABLE_STATUSES.has(source.status);
}

/** Every source split into the ones the classifier actually read and the ones
    it could not — so the card can show missing context separately. */
export function splitSources(sources: IntentSource[]): {
  available: IntentSource[];
  unavailable: IntentSource[];
} {
  return {
    available: sources.filter((source) => !isSourceUnavailable(source)),
    unavailable: sources.filter(isSourceUnavailable),
  };
}
