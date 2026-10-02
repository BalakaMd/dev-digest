import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { fromPino } from './helpers.js';

/**
 * Blast module — the impact map of a PR: symbols declared in its changed files,
 * their callers (file:line) and the HTTP endpoints / crons that depend on them.
 * Read from the persisted repo-intel index only (no re-parsing, no LLM).
 *
 *   GET /pulls/:id/blast   → PrBlastRadiusResponse (`degraded` + reason when the index is unusable)
 */
export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: PrBlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.blast.getForPull(workspaceId, req.params.id, fromPino(req.log));
    },
  );
}
