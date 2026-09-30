import type { BlastDegradedReason } from "@devdigest/shared";

/** How often to re-read the map after a resync was started. */
export const RESYNC_POLL_MS = 3000;
/** Give up polling after this long, even if the index is still incomplete. */
export const RESYNC_POLL_MAX_MS = 120_000;
/** Degraded reasons a resync can fix (`flag_off` / `repo_too_large` cannot be). */
export const RESYNC_ALLOWED_REASONS: readonly BlastDegradedReason[] = [
  "no_data",
  "index_failed",
  "index_partial",
];
