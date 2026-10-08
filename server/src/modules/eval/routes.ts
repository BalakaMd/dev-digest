import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalCaseCreateInput,
  EvalCaseDetail,
  EvalCaseFromFindingResponse,
  EvalCaseRunDetail,
  EvalCaseSummary,
  EvalCaseUpdateInput,
  EvalCompare,
  EvalDashboardOverview,
  EvalRunAllResponse,
  EvalRunDetail,
  EvalStartRunResponse,
  EvalSuiteRun,
  EvalSuiteRunStatus,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

/**
 * Eval module (SPEC-06) — regression harness for review agents.
 *
 *   POST   /findings/:id/eval-case           → case from a decided finding (201 created / 200 existing)
 *   GET    /agents/:id/eval-cases            → the agent's cases + latest result
 *   POST   /agents/:id/eval-cases            → manual case (201); a body over the global 1 MB cap is a 413
 *   GET    /eval-cases/:id                   → one case with its stored input
 *   PUT    /eval-cases/:id                   → name / expected_output only (stored input is immutable)
 *   DELETE /eval-cases/:id
 *   POST   /eval-cases/:id/run               → run the agent's current config on this one case
 *   POST   /agents/:id/eval-runs             → start a run (202 `{run_id}`), executes in the background
 *   GET    /agents/:id/eval-runs             → run history (?days=&status=&limit=)
 *   POST   /eval/run-all                     → start a run for every enabled agent with cases
 *   GET    /eval/dashboard                   → agents overview + 10 most recent runs
 *   GET    /eval/compare?a=&b=               → compare two completed runs of one agent
 *   GET    /eval-runs/:id                    → run + its case results
 *   GET    /eval-runs/:id/cases/:caseRunId   → one case result (findings, dropped, matches)
 *
 * No route sets a `bodyLimit`: the global 1 MB cap (app.ts) is the only size bound (EC-14).
 */

const CaseRunParams = z.object({ id: z.string().uuid(), caseRunId: z.string().uuid() });

const HistoryQuery = z.object({
  /** Period filter in days; omit for "all" (AC-55). */
  days: z.coerce.number().int().min(1).max(3650).optional(),
  status: EvalSuiteRunStatus.optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

const CompareQuery = z.object({ a: z.string().uuid(), b: z.string().uuid() });

const OkResponse = z.object({ ok: z.literal(true) });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // ---- cases ---------------------------------------------------------------

  app.post(
    '/findings/:id/eval-case',
    {
      schema: {
        params: IdParams,
        response: { 200: EvalCaseFromFindingResponse, 201: EvalCaseFromFindingResponse },
      },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const res = await container.evalService.createFromFinding(workspaceId, req.params.id);
      return reply.code(res.created ? 201 : 200).send(res);
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: z.array(EvalCaseSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseCreateInput, response: { 201: EvalCaseDetail } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await container.evalService.createCase(workspaceId, req.params.id, req.body);
      return reply.code(201).send(created);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.getCase(workspaceId, req.params.id);
    },
  );

  app.put(
    '/eval-cases/:id',
    { schema: { params: IdParams, body: EvalCaseUpdateInput, response: { 200: EvalCaseDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: OkResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.deleteCase(workspaceId, req.params.id);
    },
  );

  app.post(
    '/eval-cases/:id/run',
    {
      schema: { params: IdParams, response: { 200: EvalCaseDetail } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.runCase(workspaceId, req.params.id);
    },
  );

  // ---- runs ----------------------------------------------------------------

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalStartRunResponse } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await container.evalService.startRun(workspaceId, req.params.id);
      return reply.code(202).send(started);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, querystring: HistoryQuery, response: { 200: z.array(EvalSuiteRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.history(workspaceId, req.params.id, req.query);
    },
  );

  app.post(
    '/eval/run-all',
    {
      schema: { response: { 200: EvalRunAllResponse } },
      config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.startAll(workspaceId);
    },
  );

  app.get('/eval/dashboard', { schema: { response: { 200: EvalDashboardOverview } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return container.evalService.dashboard(workspaceId);
  });

  app.get(
    '/eval/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.compare(workspaceId, req.query.a, req.query.b);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.runDetail(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval-runs/:id/cases/:caseRunId',
    { schema: { params: CaseRunParams, response: { 200: EvalCaseRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return container.evalService.caseRunDetail(workspaceId, req.params.id, req.params.caseRunId);
    },
  );
}
