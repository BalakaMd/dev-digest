import { z } from 'zod';
import type { DevDigestApi } from '../api/client.js';
import { resolvePull } from '../resolve/resolvers.js';
import { selectLatestReviewPerAgent, projectFindings, renderFindingsText } from '../format/findings.js';
import { PrInput, ResponseFormat, ok, fail, toToolError } from './common.js';
import { DEFAULT_FINDINGS_LIMIT, MAX_FINDINGS_LIMIT, TOOL_NAMES } from '../constants.js';

const InputSchema = {
  pr: PrInput,
  run_id: z.string().uuid().optional().describe('One specific run; omit for the latest review per agent.'),
  min_severity: z
    .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
    .default('SUGGESTION')
    .describe('Lowest severity to include.'),
  limit: z.coerce.number().int().min(1).max(MAX_FINDINGS_LIMIT).default(DEFAULT_FINDINGS_LIMIT),
  offset: z.coerce.number().int().min(0).default(0),
  response_format: ResponseFormat,
};

type Input = {
  pr: string;
  run_id?: string;
  min_severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  limit: number;
  offset: number;
  response_format: 'concise' | 'detailed';
};

export function registerGetFindings(api: DevDigestApi, apiUrl: string) {
  return {
    name: TOOL_NAMES.getFindings,
    config: {
      title: 'Get DevDigest review findings',
      description:
        'Get DevDigest review findings for a PR: one run (run_id) or the latest review per agent. Filter by severity; paginated.',
      inputSchema: InputSchema,
      outputSchema: {
        pr: z.string(),
        run_id: z.string().nullable(),
        run_status: z.string().optional(),
        total: z.number().int(),
        returned: z.number().int(),
        offset: z.number().int(),
        next_offset: z.number().int().nullable(),
        hidden_dismissed: z.number().int(),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler: async (args: Input) => {
      try {
        // No sync fallback: a PR never imported can't have findings.
        const { pr } = await resolvePull(api, args.pr);
        const [runs, reviews] = await Promise.all([api.listRuns(pr.id!), api.listReviews(pr.id!)]);

        if (args.run_id) {
          const run = runs.find((r) => r.run_id === args.run_id);
          if (!run) return fail(`Run not found on ${args.pr}.`);
          if (run.status === 'running') {
            return ok(`Run ${args.run_id} is still running. Retry in ~30 s.`, {
              pr: args.pr,
              run_id: args.run_id,
              run_status: 'running',
              total: 0,
              returned: 0,
              offset: 0,
              next_offset: null,
              hidden_dismissed: 0,
            });
          }
          if (run.status === 'failed' || run.status === 'cancelled') {
            const errText = run.error ? run.error.slice(0, 200) : 'no error recorded';
            return fail(`Run ${args.run_id} ${run.status}: ${errText}`);
          }
          const review = reviews.find((r) => r.run_id === args.run_id);
          const projection = projectFindings(review ? [review] : [], {
            minSeverity: args.min_severity,
            limit: args.limit,
            offset: args.offset,
            detailed: args.response_format === 'detailed',
          });
          return ok(renderFindingsText(projection), {
            pr: args.pr,
            run_id: args.run_id,
            run_status: run.status ?? 'unknown',
            total: projection.total,
            returned: projection.returned,
            offset: projection.offset,
            next_offset: projection.nextOffset,
            hidden_dismissed: projection.hiddenDismissed,
          });
        }

        const latest = selectLatestReviewPerAgent(reviews);
        const projection = projectFindings(latest, {
          minSeverity: args.min_severity,
          limit: args.limit,
          offset: args.offset,
          detailed: args.response_format === 'detailed',
        });
        return ok(renderFindingsText(projection), {
          pr: args.pr,
          run_id: null,
          total: projection.total,
          returned: projection.returned,
          offset: projection.offset,
          next_offset: projection.nextOffset,
          hidden_dismissed: projection.hiddenDismissed,
        });
      } catch (err) {
        return toToolError(err, apiUrl);
      }
    },
  };
}
