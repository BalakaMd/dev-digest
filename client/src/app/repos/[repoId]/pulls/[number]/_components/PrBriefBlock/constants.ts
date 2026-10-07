import type { TourLanguage } from "@devdigest/shared";

/** Languages of generated prose written right-to-left. */
export const RTL_LANGUAGES: readonly TourLanguage[] = ["Hebrew"];

export const SHORT_SHA_LENGTH = 7;

/** Refresh interval of the relative "generated … ago" label. */
export const NOW_INTERVAL_MS = 60_000;

/** `BriefMissingInput.input` → key under `brief:missingInputs`. */
export const MISSING_INPUT_LABEL_KEY = {
  intent: "intent",
  blast: "blast",
  specs: "specDocs",
  issue: "linkedIssue",
} as const;
