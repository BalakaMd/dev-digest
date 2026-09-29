import { z } from 'zod';
import type { DevDigestApi } from '../api/client.js';
import { resolveRepo } from '../resolve/resolvers.js';
import { projectConventions, renderConventionsText } from '../format/conventions.js';
import { ResponseFormat, ok, toToolError } from './common.js';
import { TOOL_NAMES } from '../constants.js';

const InputSchema = {
  repo: z.string().min(1).describe('A repo as owner/repo or a GitHub URL.'),
  status: z.enum(['accepted', 'pending', 'all']).default('accepted').describe('Which candidates to include.'),
  response_format: ResponseFormat,
};

export function registerGetConventions(api: DevDigestApi, apiUrl: string) {
  return {
    name: TOOL_NAMES.getConventions,
    config: {
      title: "Get a repo's conventions",
      description: "Get a repository's coding conventions extracted by DevDigest (accepted house rules by default).",
      inputSchema: InputSchema,
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler: async (args: { repo: string; status: 'accepted' | 'pending' | 'all'; response_format: 'concise' | 'detailed' }) => {
      try {
        const repo = await resolveRepo(api, args.repo);
        const state = await api.getConventions(repo.id);
        const projection = projectConventions(state, args.status, args.response_format === 'detailed');
        return ok(renderConventionsText(projection));
      } catch (err) {
        return toToolError(err, apiUrl);
      }
    },
  };
}
