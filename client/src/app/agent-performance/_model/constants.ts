/* Constants of the Agent Performance page (SPEC-10). Rules live in sibling modules. */

export const RANGE_KINDS = ["1d", "30d", "custom"] as const;
export type RangeKind = (typeof RANGE_KINDS)[number];
export const DEFAULT_RANGE_KIND: RangeKind = "30d";

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
/** Preset spans, sent as `from = now − span`, `to = now` (AC-5). */
export const PRESET_SPAN_MS: Record<Exclude<RangeKind, "custom">, number> = {
  "1d": DAY_MS,
  "30d": 30 * DAY_MS,
};

/** A custom range may cover at most this many calendar days, both ends included (AC-6). */
export const MAX_CUSTOM_DAYS = 366;

/** Decisions needed before an accept rate is more than a low sample (AC-14). */
export const MIN_DECISIONS = 10;

/** Accept-rate colour thresholds on the unrounded fraction (AC-68). */
export const ACCEPT_HIGH = 0.7;
export const ACCEPT_MEDIUM = 0.5;

/** Donut shows this many largest slices, the rest collapses into "Other" (AC-51). */
export const TOP_SLICES = 6;

export const SORT_COLUMNS = ["accept", "runs", "avg_cost", "avg_duration", "last_run"] as const;
export type SortColumn = (typeof SORT_COLUMNS)[number];
export const SORT_DIRS = ["desc", "asc"] as const;
export type SortDir = (typeof SORT_DIRS)[number];
export const DEFAULT_SORT: SortColumn = "accept";
export const DEFAULT_DIR: SortDir = "desc";
