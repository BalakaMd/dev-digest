/** Run statuses that are counted (AC-7). `running` is never counted. */
export const COUNTED_STATUSES = ['done', 'failed', 'cancelled'] as const;

/** An accept rate with fewer decisions than this is marked low sample (AC-14). */
export const MIN_DECISIONS = 10;

export const HOUR_MS = 3_600_000;
export const DAY_MS = 24 * HOUR_MS;
