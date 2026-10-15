import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { PrHistoryResponse } from '@devdigest/shared';
import * as t from '../../db/schema.js';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { fromPino } from './helpers.js';
import { renderHistoryMarkdown } from './render.js';

const MarkdownQuery = z.object({ limit: z.coerce.number().int().optional() });

/**
 * History module — prior merged PRs that touched the same files as a PR, read
 * from GitHub (GraphQL) and cached in memory. No LLM, no DB writes.
 *
 *   GET /pulls/:id/history   → PrHistoryResponse (`degraded` + reason when GitHub is unusable)
 *   GET /pulls/:id/history/markdown?limit=N → the same list as a downloadable Markdown file
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

  app.get(
    '/pulls/:id/history/markdown',
    { schema: { params: IdParams, querystring: MarkdownQuery } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const history = await container.history.getForPull(workspaceId, req.params.id, fromPino(req.log));

      const [pr] = await container.db
        .select({ title: t.pullRequests.title })
        .from(t.pullRequests)
        .where(eq(t.pullRequests.id, req.params.id));
      const title = pr?.title ?? 'pull request';

      const markdown = renderHistoryMarkdown(history, { title, limit: req.query.limit });
      return reply
        .header('content-type', 'text/markdown; charset=utf-8')
        .header('content-disposition', `attachment; filename="history-${title}.md"`)
        .send(markdown);
    },
  );
}
