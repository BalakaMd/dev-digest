import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ConventionSkillSplit,
  CreateConventionSkillsInput,
  UpdateConventionInput,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';

/**
 * Conventions module — extracts a repo's house rules into reviewable
 * candidates, then turns the accepted ones into skills.
 *
 *   POST  /repos/:id/conventions/extract       → run a scan (sample → LLM → verify → persist)
 *   GET   /repos/:id/conventions               → latest scan + pending/accepted candidates + rejected ones apart
 *   PATCH /conventions/:id                     → accept / reject / restore (→ pending), or edit rule & category
 *   GET   /repos/:id/conventions/skill-drafts  → skill drafts from accepted (?split=single|category)
 *   POST  /repos/:id/conventions/skills        → create NEW skills from (edited) drafts
 */

const DraftsQuery = z.object({ split: ConventionSkillSplit.default('single') });

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new ConventionsService(app.container);

  app.post('/repos/:id/conventions/extract', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.extract(workspaceId, req.params.id);
  });

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId, req.params.id);
  });

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: UpdateConventionInput } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const candidate = await service.update(workspaceId, req.params.id, req.body);
      if (!candidate) throw new NotFoundError('Convention not found');
      return candidate;
    },
  );

  app.get(
    '/repos/:id/conventions/skill-drafts',
    { schema: { params: IdParams, querystring: DraftsQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.skillDrafts(workspaceId, req.params.id, req.query.split);
    },
  );

  app.post(
    '/repos/:id/conventions/skills',
    { schema: { params: IdParams, body: CreateConventionSkillsInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const skills = await service.createSkills(workspaceId, req.params.id, req.body);
      reply.status(201);
      return skills;
    },
  );
}
