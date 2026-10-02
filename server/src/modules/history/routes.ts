import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistoryResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { fromPino } from './helpers.js';

/**
 * History module — prior merged PRs that touched the same files as a PR, read
 * from GitHub (GraphQL) and cached in memory. No LLM, no DB writes.
 *
 *   GET /pulls/:id/history   → PrHistoryResponse (`degraded` + reason when GitHub is unusable)
 */
export default async function historyRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistoryResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.history.getForPull(workspaceId, req.params.id, fromPino(req.log));
    },
  );
}
