import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { fromPino } from './helpers.js';

/**
 * Intent module — derives and stores a PR's intent (what it is meant to do)
 * separately from the review agents.
 *
 *   GET  /pulls/:id/intent   → the stored intent (`stale: true` once the PR head moved), or null
 *   POST /pulls/:id/intent   → derive + persist a fresh intent (synchronous; one LLM call)
 */
export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const intent = await container.intent.get(workspaceId, req.params.id);
      return { intent };
    },
  );

  app.post(
    '/pulls/:id/intent',
    { schema: { params: IdParams }, config: { rateLimit: { max: 10, timeWindow: '1 minute' } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.intent.derive(workspaceId, req.params.id, fromPino(req.log));
    },
  );
}
