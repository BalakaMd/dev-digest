import { z } from 'zod';
import { PrHistory } from './brief.js';

/**
 * Response of `GET /pulls/:id/history`: prior merged PRs that touched the same
 * files. A superset of `PrHistory`, so it also parses as `PrHistory`.
 * `degraded` is true when the list could not be produced (see reason).
 */
export const PrHistoryDegradedReason = z.enum(['no_token', 'github_error', 'no_files']);
export type PrHistoryDegradedReason = z.infer<typeof PrHistoryDegradedReason>;

export const PrHistoryResponse = PrHistory.extend({
  degraded: z.boolean(),
  degraded_reason: PrHistoryDegradedReason.nullable(),
});
export type PrHistoryResponse = z.infer<typeof PrHistoryResponse>;
