import type { DevDigestApi } from '../api/client.js';
import { resolvePull } from '../resolve/resolvers.js';
import { projectBlast, renderBlastText } from '../format/blast.js';
import { PrInput, ResponseFormat, ok, toToolError } from './common.js';
import { TOOL_NAMES } from '../constants.js';

const InputSchema = { pr: PrInput, response_format: ResponseFormat };

type Input = { pr: string; response_format: 'concise' | 'detailed' };

export function registerGetBlastRadius(api: DevDigestApi, apiUrl: string) {
  return {
    name: TOOL_NAMES.getBlastRadius,
    config: {
      title: 'Blast radius of a PR',
      description:
        "Impact map of a PR from DevDigest's code index: symbols declared in changed files, their callers (file:line), and the HTTP endpoints / cron jobs that depend on them. Call it before reviewing or changing a PR to see what else it can break. Lists every caller the API returned per symbol (same map as the UI); response_format='detailed' also adds each caller's function name and the indexed commit. Read-only; no LLM.",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler: async (args: Input) => {
      try {
        // No sync fallback: a PR never imported has no blast radius.
        const { pr } = await resolvePull(api, args.pr);
        const res = await api.getBlastRadius(pr.id!);
        const projection = projectBlast(res, { detailed: args.response_format === 'detailed' });
        return ok(renderBlastText(projection, args.pr));
      } catch (err) {
        return toToolError(err, apiUrl);
      }
    },
  };
}
