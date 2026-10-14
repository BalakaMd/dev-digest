import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  CiCheckInput,
  CiCheckResult,
  CiInstallInput,
  CiInstallResult,
  CiInstallation,
  CiPreview,
  CiPreviewInput,
  CiRefreshResult,
  CiRunDetail,
  CiRunsPage,
  CiSecretsStatus,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Export-to-CI module (SPEC-09).
 *
 *   POST /agents/:id/ci/preview         → files an export would write (nothing is written)
 *   POST /agents/:id/ci/check           → validate a hand-edited workflow
 *   GET  /agents/:id/ci/secrets?repo=   → which Actions secrets the repo has (names only)
 *   POST /agents/:id/ci/install         → open/update the PR or build the zip
 *   GET  /agents/:id/ci/installations   → the agent's installations + latest run
 *   POST /ci/refresh                    → pull finished runs from GitHub (no body)
 *   GET  /ci/runs?limit=&cursor=&agent_id=&installation_id= → CI runs, newest first
 *   GET  /ci/runs/:id                   → one run with its trace
 *
 * CI runs are only ever pulled by the studio (`/ci/refresh`); no route accepts a run from outside (AC-53).
 */

const SecretsQuery = z.object({ repo: z.string().min(1).max(200) });

const RunsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).optional(),
  cursor: z.string().min(1).max(200).optional(),
  agent_id: z.string().uuid().optional(),
  installation_id: z.string().uuid().optional(),
});

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiPreviewInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciService.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/ci/check',
    { schema: { params: IdParams, body: CiCheckInput, response: { 200: CiCheckResult } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciService.check(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci/secrets',
    { schema: { params: IdParams, querystring: SecretsQuery, response: { 200: CiSecretsStatus } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciService.secretsStatus(workspaceId, req.params.id, req.query.repo);
    },
  );

  app.post(
    '/agents/:id/ci/install',
    { schema: { params: IdParams, body: CiInstallInput, response: { 200: CiInstallResult } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciService.install(workspaceId, req.params.id, req.body, req.log);
    },
  );

  app.get(
    '/agents/:id/ci/installations',
    { schema: { params: IdParams, response: { 200: z.array(CiInstallation) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciService.listInstallations(workspaceId, req.params.id);
    },
  );

  app.post(
    '/ci/refresh',
    { schema: { response: { 200: CiRefreshResult } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciCollector.refresh(workspaceId, req.log);
    },
  );

  app.get(
    '/ci/runs',
    { schema: { querystring: RunsQuery, response: { 200: CiRunsPage } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const q = req.query;
      return container.ciService.listRuns(workspaceId, {
        limit: q.limit,
        cursor: q.cursor,
        agentId: q.agent_id,
        installationId: q.installation_id,
      });
    },
  );

  app.get(
    '/ci/runs/:id',
    { schema: { params: IdParams, response: { 200: CiRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.ciService.getRun(workspaceId, req.params.id);
    },
  );
}
