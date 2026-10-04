import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingTourState } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Onboarding Tour module (SPEC-03).
 *
 *   GET  /repos/:id/onboarding           → stored tour + generation/readiness state (no LLM, no index work)
 *   POST /repos/:id/onboarding/generate  → start or attach to a generation (202); 422 `details.reason` when blocked / key missing
 */
export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourState } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.onboarding.getState(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    {
      schema: { params: IdParams, response: { 202: OnboardingTourState } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const state = await container.onboarding.generate(workspaceId, req.params.id, req.log);
      reply.status(202);
      return state;
    },
  );
}
