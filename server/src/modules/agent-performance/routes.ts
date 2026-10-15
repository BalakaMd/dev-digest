import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { AgentPerformanceDetail, AgentPerformanceOverview, AgentPerformanceQuery } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Agent Performance (SPEC-10) — two read-only endpoints; nothing is written, no model call.
 *
 *   GET /agent-performance?repoId=&from=&to=       → all-agents aggregation
 *   GET /agents/:id/performance?repoId=&from=&to=  → one agent (enabled or disabled)
 *
 * Covered by the app-wide rate limit; no per-route override (NFR-5).
 */
export default async function agentPerformanceRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/agent-performance',
    { schema: { querystring: AgentPerformanceQuery, response: { 200: AgentPerformanceOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.agentPerformanceService.getOverview(workspaceId, req.query);
    },
  );

  app.get(
    '/agents/:id/performance',
    {
      schema: {
        params: IdParams,
        querystring: AgentPerformanceQuery,
        response: { 200: AgentPerformanceDetail },
      },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.agentPerformanceService.getAgentDetail(workspaceId, req.params.id, req.query);
    },
  );
}
