import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * PR Brief module (SPEC-04).
 *
 *   GET  /pulls/:id/brief   → stored brief + `stale` flag, or `{ brief: null }` (never calls the model)
 *   POST /pulls/:id/brief   → generate + store a fresh brief (synchronous, one model request);
 *                             404 unknown PR · 409 `already_running` · 422 `missing_key` / `over_budget` · 502 `generation_failed`
 */
export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.brief.get(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.brief.generate(workspaceId, req.params.id, req.log);
    },
  );
}
