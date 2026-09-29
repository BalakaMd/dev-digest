import { z } from 'zod';
import type { DevDigestApi } from '../api/client.js';
import { resolvePull, resolveAgent } from '../resolve/resolvers.js';
import { waitForRuns } from '../review/wait.js';
import { projectFindings, renderFindingsText } from '../format/findings.js';
import { PrInput, fail, ok, toToolError, isNoKeyMessage, noKeyHint } from './common.js';
import { RUN_WAIT_CAP_MS, POLL_INTERVAL_MS, TOOL_NAMES } from '../constants.js';
import type { RunSummary, ReviewRecord, SecretsStatus } from '@devdigest/shared';

const InputSchema = {
  pr: PrInput,
  agent: z.string().min(1).optional().describe('Agent name or id; omit to run all enabled agents.'),
};

type Input = { pr: string; agent?: string };

interface RunProjectionOut {
  run_id: string;
  agent: string;
  status: string;
  score: number | null;
  verdict: string | null;
  counts: { critical: number; warning: number; suggestion: number };
  blockers: number | null;
  cost_usd: number | null;
  duration_s: number | null;
  error?: string;
}

function providerOf(agentProvider: string): keyof SecretsStatus | null {
  if (agentProvider === 'openai' || agentProvider === 'anthropic' || agentProvider === 'openrouter') {
    return agentProvider;
  }
  return null;
}

function countsFor(review: ReviewRecord | undefined) {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  if (!review) return counts;
  for (const f of review.findings) {
    if (f.dismissed_at) continue;
    if (f.severity === 'CRITICAL') counts.critical += 1;
    else if (f.severity === 'WARNING') counts.warning += 1;
    else if (f.severity === 'SUGGESTION') counts.suggestion += 1;
  }
  return counts;
}

function projectRun(run: RunSummary, review: ReviewRecord | undefined): RunProjectionOut {
  const out: RunProjectionOut = {
    run_id: run.run_id,
    agent: run.agent_name ?? 'unknown',
    status: run.status ?? 'unknown',
    score: run.score,
    verdict: review?.verdict ?? null,
    counts: countsFor(review),
    blockers: run.blockers,
    cost_usd: run.cost_usd,
    duration_s: run.duration_ms != null ? Math.round(run.duration_ms / 1000) : null,
  };
  if (run.status === 'failed') {
    out.error =
      run.error && run.error.length > 0
        ? run.error.slice(0, 200)
        : 'failed (no error recorded — the API may have restarted)';
  }
  return out;
}

/**
 * `devdigest_run_review` — blocking with a 120 s cap (task decision). See
 * "Blocking algorithm" in the plan for the full step-by-step.
 */
export function registerRunReview(api: DevDigestApi, apiUrl: string) {
  return {
    name: TOOL_NAMES.runReview,
    config: {
      title: 'Run a DevDigest review',
      description:
        'Run DevDigest AI review agent(s) on a pull request and wait up to 120 s for results. Costs LLM tokens. Omit `agent` to run all enabled agents.',
      inputSchema: InputSchema,
      outputSchema: {
        status: z.enum(['completed', 'partial', 'failed']),
        pr: z.string(),
        waited_s: z.number(),
        runs: z.array(
          z.object({
            run_id: z.string(),
            agent: z.string(),
            status: z.string(),
            score: z.number().nullable(),
            verdict: z.string().nullable(),
            counts: z.object({ critical: z.number(), warning: z.number(), suggestion: z.number() }),
            blockers: z.number().nullable(),
            cost_usd: z.number().nullable(),
            duration_s: z.number().nullable(),
            error: z.string().optional(),
          }),
        ),
        next: z.string().optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    handler: async (
      args: Input,
      extra: { signal?: AbortSignal; _meta?: { progressToken?: string | number }; sendNotification?: (n: unknown) => Promise<void> },
    ) => {
      const t0 = Date.now();
      const deadline = t0 + RUN_WAIT_CAP_MS;
      try {
        // Step 2: resolve the PR, syncing once if it's not yet imported.
        const { pr } = await resolvePull(api, args.pr, { syncIfMissing: true });

        // Step 3: resolve targets.
        const agents = await api.listAgents();
        let body: { agentId?: string; all?: boolean };
        let targetProviders: string[];
        if (args.agent) {
          const resolved = resolveAgent(agents, args.agent);
          body = { agentId: resolved.id };
          const full = agents.find((a) => a.id === resolved.id)!;
          targetProviders = [full.provider];
        } else {
          const enabled = agents.filter((a) => a.enabled);
          if (enabled.length === 0) {
            return fail('No enabled agents — enable one in the studio (Agents) or pass `agent`.');
          }
          body = { all: true };
          targetProviders = [...new Set(enabled.map((a) => a.provider))];
        }

        // Step 4: best-effort key pre-check, before creating any run.
        try {
          const status = await api.secretsStatus();
          for (const provider of targetProviders) {
            const key = providerOf(provider);
            if (key && status[key] === false) {
              return fail(noKeyHint(`${provider.toUpperCase()}_API_KEY is not configured`));
            }
          }
        } catch {
          // Pre-check itself failed — skip it, the run attempt will surface a key error anyway.
        }

        // Step 5: start the run(s).
        const started = await api.startReview(pr.id!, body);
        const runIds = started.runs.map((r) => r.run_id);

        // Step 6: poll until terminal, deadline, or abort.
        const waited = await waitForRuns({
          fetchRuns: () => api.listRuns(pr.id!),
          runIds,
          deadline,
          intervalMs: POLL_INTERVAL_MS,
          signal: extra.signal,
          onProgress: ({ elapsedMs, runs }) => {
            const token = extra._meta?.progressToken;
            if (token === undefined || !extra.sendNotification) return;
            const doneCount = runs.filter((r) => r.status === 'done' || r.status === 'failed' || r.status === 'cancelled').length;
            void extra.sendNotification({
              method: 'notifications/progress',
              params: {
                progressToken: token,
                progress: Math.round(elapsedMs / 1000),
                total: 120,
                message: `${doneCount}/${runs.length} runs finished`,
              },
            });
          },
        });

        if (waited.outcome === 'aborted') {
          return fail('Cancelled — the review keeps running on the server.', { pr: args.pr, runs: waited.runs.map((r) => r.run_id) });
        }

        // Step 7: build the result from one more reviews read.
        const reviews = await api.listReviews(pr.id!);
        const reviewByRunId = new Map(reviews.filter((r) => r.run_id).map((r) => [r.run_id!, r]));
        const runProjections = waited.runs.map((r) => projectRun(r, reviewByRunId.get(r.run_id)));

        const allTerminal = waited.outcome === 'completed';
        const anyDone = runProjections.some((r) => r.status === 'done');
        const allFailed = runProjections.every((r) => r.status === 'failed' || r.status === 'cancelled');

        const status: 'completed' | 'partial' | 'failed' = allFailed
          ? 'failed'
          : allTerminal && anyDone
            ? 'completed'
            : 'partial';

        const matchedReviews = [...reviewByRunId.values()];
        const topProjection = projectFindings(matchedReviews, { limit: 10 });
        const topText = renderFindingsText(topProjection);

        const next =
          status === 'partial'
            ? `Runs continue on the server. Call devdigest_get_findings with pr=${args.pr} run_id=<id> in a minute.`
            : undefined;

        const structured = {
          status,
          pr: args.pr,
          waited_s: Math.round((Date.now() - t0) / 1000),
          runs: runProjections,
          ...(next ? { next } : {}),
        };

        const summaryLines = runProjections.map(
          (r) => `${r.agent}: ${r.status}${r.score != null ? ` (score ${r.score})` : ''}${r.error ? ` — ${r.error}` : ''}`,
        );
        const text = [...summaryLines, '', topText, ...(next ? ['', next] : [])].join('\n');

        if (status === 'failed') {
          const keyErr = runProjections.find((r) => r.error && isNoKeyMessage(r.error));
          const prefix = keyErr ? `${noKeyHint(keyErr.error!)}\n\n` : '';
          return fail(prefix + text, structured);
        }
        return ok(text, structured);
      } catch (err) {
        return toToolError(err, apiUrl);
      }
    },
  };
}
