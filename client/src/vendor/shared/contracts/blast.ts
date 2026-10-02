import { z } from 'zod';
import { BlastRadius } from './brief.js';

/**
 * Blast-radius response for `GET /pulls/:id/blast`.
 *
 * A superset of `BlastRadius` (brief.ts): the same map plus the degradation
 * marker, so the UI and MCP can tell "no callers" from "index not usable".
 */

/** Same literals as `DegradedReason` in the server's repo-intel types. */
export const BlastDegradedReason = z.enum([
  'flag_off',
  'index_failed',
  'index_partial',
  'repo_too_large',
  'no_data',
]);
export type BlastDegradedReason = z.infer<typeof BlastDegradedReason>;

export const PrBlastRadiusResponse = BlastRadius.extend({
  degraded: z.boolean(),
  degraded_reason: BlastDegradedReason.nullable(),
  /** Commit the caller line numbers refer to (null when there is no index). */
  indexed_sha: z.string().nullable(),
});
export type PrBlastRadiusResponse = z.infer<typeof PrBlastRadiusResponse>;
