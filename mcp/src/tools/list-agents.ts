import type { DevDigestApi } from '../api/client.js';
import { renderAgentsText } from '../format/agents.js';
import { ResponseFormat, ok, toToolError } from './common.js';
import { TOOL_NAMES } from '../constants.js';

export function registerListAgents(api: DevDigestApi, apiUrl: string) {
  return {
    name: TOOL_NAMES.listAgents,
    config: {
      title: 'List DevDigest agents',
      description:
        'List DevDigest review agents (name, model, enabled). Use a name as `agent` in devdigest_run_review.',
      inputSchema: { response_format: ResponseFormat },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler: async ({ response_format }: { response_format: 'concise' | 'detailed' }) => {
      try {
        const agents = await api.listAgents();
        return ok(renderAgentsText(agents, response_format === 'detailed'));
      } catch (err) {
        return toToolError(err, apiUrl);
      }
    },
  };
}
