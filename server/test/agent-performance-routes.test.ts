import { describe, it, expect, beforeAll, afterAll, vi, type MockInstance } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockAuthProvider } from '../src/adapters/mocks.js';
import { NotFoundError } from '../src/platform/errors.js';
import type { AgentPerformanceService } from '../src/modules/agent-performance/service.js';

/**
 * SPEC-10 AC-24 / NFR-2 — no-DB route checks via app.inject(): an invalid query or `:id` is rejected
 * with 422 `validation_error` BEFORE the handler, so the service (and therefore any query) is never
 * reached. postgres-js connects lazily, so these run without Docker.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const UUID = '3f2b8c1e-6a4d-4e0b-9c57-1d2e3f4a5b6c';
const FROM = '2026-03-01T00:00:00.000Z';
const TO = '2026-03-31T00:00:00.000Z';
const qs = (o: Record<string, string>) => new URLSearchParams(o).toString();
const good = { repoId: UUID, from: FROM, to: TO };

describe('agent-performance routes — validation (no DB)', () => {
  let app: FastifyInstance;
  let overview: MockInstance<AgentPerformanceService['getOverview']>;
  let detail: MockInstance<AgentPerformanceService['getAgentDetail']>;

  beforeAll(async () => {
    app = await buildApp({ config, overrides: { auth: new MockAuthProvider() } });
    overview = vi.spyOn(app.container.agentPerformanceService, 'getOverview');
    detail = vi.spyOn(app.container.agentPerformanceService, 'getAgentDetail');
  });
  afterAll(async () => {
    await app.close();
  });

  it('wiring check: a valid query reaches the service with the caller workspace (and its 404 maps through)', async () => {
    overview.mockRejectedValueOnce(new NotFoundError('Repository not found'));
    const res = await app.inject({ method: 'GET', url: `/agent-performance?${qs(good)}` });
    expect(res.statusCode).toBe(404);
    expect(overview).toHaveBeenCalledTimes(1);
    expect(overview).toHaveBeenCalledWith('w1', good);
    overview.mockClear();

    detail.mockRejectedValueOnce(new NotFoundError('Agent not found'));
    const res2 = await app.inject({ method: 'GET', url: `/agents/${UUID}/performance?${qs(good)}` });
    expect(res2.statusCode).toBe(404);
    expect(detail).toHaveBeenCalledWith('w1', UUID, good);
    detail.mockClear();
  });

  const BAD_QUERIES: [string, Record<string, string>][] = [
    ['repoId missing', { from: FROM, to: TO }],
    ['repoId not a uuid', { ...good, repoId: 'acme/web' }],
    ['from not an instant', { ...good, from: '2026-03-01' }],
    ['from not before to', { ...good, from: TO, to: FROM }],
    ['span over 366 days + 1 h', { ...good, from: '2025-01-01T00:00:00.000Z', to: '2026-03-01T00:00:00.000Z' }],
  ];

  it.each(BAD_QUERIES)('GET /agent-performance → 422 validation_error when %s', async (_n, query) => {
    const res = await app.inject({ method: 'GET', url: `/agent-performance?${qs(query)}` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(overview).not.toHaveBeenCalled();
  });

  it.each(BAD_QUERIES)('GET /agents/:id/performance → 422 validation_error when %s', async (_n, query) => {
    const res = await app.inject({ method: 'GET', url: `/agents/${UUID}/performance?${qs(query)}` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(detail).not.toHaveBeenCalled();
  });

  it('GET /agents/:id/performance → 422 validation_error on a non-uuid agent id, even with a valid query', async () => {
    const res = await app.inject({ method: 'GET', url: `/agents/not-a-uuid/performance?${qs(good)}` });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    expect(detail).not.toHaveBeenCalled();
  });
});
