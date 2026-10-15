import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import type { AgentPerformanceDetail, AgentPerformanceOverview } from '@devdigest/shared';
import { dockerAvailable } from './helpers/pg.js';
import {
  insertAgent,
  insertRepo,
  makePerfApp,
  rangeQuery,
  seedVolume,
  usePerfDb,
} from './helpers/agent-performance.js';

/**
 * SPEC-10 NFR-1 / NFR-4 — with 10 000 counted runs in the range (and 10 000 in the previous period,
 * with decisions on the local ones), each read answers within 2 seconds, and two identical reads
 * return deep-equal bodies.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PER_PERIOD = 10_000;
const BUDGET_MS = 2000;

d('Agent Performance reads at volume (real Postgres)', () => {
  const env = usePerfDb();
  let app: FastifyInstance;
  let repoId: string;
  let agentIds: string[];
  let seeded: { runs: number; localRuns: number };

  beforeAll(async () => {
    app = await makePerfApp(env);
    const repo = await insertRepo(env, 'acme/web');
    repoId = repo.id;
    agentIds = [];
    for (let i = 0; i < 8; i++) agentIds.push((await insertAgent(env, { name: `agent-${i}` })).id);
    seeded = await seedVolume(env, { repoId, repoFullName: 'acme/web', agentIds, perPeriod: PER_PERIOD });
  }, 300_000);
  afterAll(async () => {
    await app?.close();
  });

  async function timed(url: string) {
    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url });
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.info(`[agent-performance perf] ${url.split('?')[0]} ${Math.round(ms)} ms`);
    expect(res.statusCode).toBe(200);
    return { ms, body: res.json() };
  }

  it('seeds what it claims to', () => {
    expect(seeded.runs).toBe(2 * PER_PERIOD);
    expect(seeded.localRuns).toBeGreaterThan(10_000);
  });

  it(`the all-agents read answers in under ${BUDGET_MS} ms and is deterministic`, async () => {
    const url = `/agent-performance?${rangeQuery(repoId)}`;
    await timed(url); // warm the app and the connection
    const first = await timed(url);
    const second = await timed(url);

    expect(first.ms).toBeLessThan(BUDGET_MS);
    expect(second.ms).toBeLessThan(BUDGET_MS);
    expect(second.body).toEqual(first.body);

    const o = first.body as AgentPerformanceOverview;
    expect(o.totals.runs).toBe(PER_PERIOD);
    expect(o.buckets.reduce((s, b) => s + b.runs, 0)).toBe(PER_PERIOD);
    expect(o.previous_period.has_runs).toBe(true);
    expect(o.rows).toHaveLength(8);
    // 7 of 10 runs are local; each local run has one accepted and one dismissed finding
    expect(o.totals.accept.accepted).toBe(o.totals.accept.dismissed);
    expect(o.totals.accept.decisions).toBeGreaterThan(10_000);
  }, 120_000);

  it(`the per-agent read answers in under ${BUDGET_MS} ms and is deterministic`, async () => {
    const url = `/agents/${agentIds[0]}/performance?${rangeQuery(repoId)}`;
    await timed(url);
    const first = await timed(url);
    const second = await timed(url);

    expect(first.ms).toBeLessThan(BUDGET_MS);
    expect(second.ms).toBeLessThan(BUDGET_MS);
    expect(second.body).toEqual(first.body);
    expect((first.body as AgentPerformanceDetail).runs).toBe(PER_PERIOD / 8);
  }, 120_000);
});
