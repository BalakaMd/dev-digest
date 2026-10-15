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
 * SPEC-10 NFR-1 on a COLD database: 10 000 counted runs in the range (and 10 000 in the previous
 * period) bulk-loaded WITHOUT `ANALYZE`, so the planner has no statistics. Before migration 0019 the
 * decision join (`reviews.run_id`, `findings.review_id`) had no index and a read took ~17 s here; the two
 * btree indexes must keep each read under 2 seconds regardless of statistics.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const PER_PERIOD = 10_000;
const BUDGET_MS = 2000;

d('Agent Performance reads at volume without table statistics (real Postgres)', () => {
  const env = usePerfDb();
  let app: FastifyInstance;
  let repoId: string;
  let agentIds: string[];

  beforeAll(async () => {
    app = await makePerfApp(env);
    const repo = await insertRepo(env, 'acme/web');
    repoId = repo.id;
    agentIds = [];
    for (let i = 0; i < 8; i++) agentIds.push((await insertAgent(env, { name: `agent-${i}` })).id);
    await seedVolume(env, { repoId, repoFullName: 'acme/web', agentIds, perPeriod: PER_PERIOD, analyze: false });  }, 300_000);
  afterAll(async () => {
    await app?.close();
  });

  async function timed(url: string) {
    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url });
    const ms = performance.now() - t0;
    // eslint-disable-next-line no-console
    console.info(`[agent-performance cold perf] ${url.split('?')[0]} ${Math.round(ms)} ms`);
    expect(res.statusCode).toBe(200);
    return { ms, body: res.json() };
  }

  it('is really cold: the planner has no statistics for the three tables', async () => {
    const rows = await env.pg.handle.sql`
      select distinct tablename from pg_stats where schemaname = 'public' and tablename in ('agent_runs', 'reviews', 'findings')`;
    expect(rows.map((r) => r.tablename)).toEqual([]);
  });

  it('has btree indexes on the decision join keys (reviews.run_id, findings.review_id)', async () => {
    const rows = await env.pg.handle.sql`
      select indexname, indexdef from pg_indexes
      where schemaname = 'public' and indexname in ('reviews_run_idx', 'findings_review_idx')
      order by indexname`;
    expect(rows.map((r) => r.indexname)).toEqual(['findings_review_idx', 'reviews_run_idx']);
    expect(rows[0]!.indexdef).toMatch(/ON public\.findings USING btree \(review_id\)/);
    expect(rows[1]!.indexdef).toMatch(/ON public\.reviews USING btree \(run_id\)/);
  });

  it(`the all-agents read answers in under ${BUDGET_MS} ms`, async () => {
    const url = `/agent-performance?${rangeQuery(repoId)}`;
    const first = await timed(url); // the first read after the load: no warm-up, no statistics
    const second = await timed(url);

    expect(first.ms).toBeLessThan(BUDGET_MS);
    expect(second.ms).toBeLessThan(BUDGET_MS);
    const o = first.body as AgentPerformanceOverview;
    expect(o.totals.runs).toBe(PER_PERIOD);
    expect(o.totals.accept.decisions).toBeGreaterThan(10_000); // the decision join really ran
  }, 120_000);

  it(`the per-agent read answers in under ${BUDGET_MS} ms`, async () => {
    const url = `/agents/${agentIds[0]}/performance?${rangeQuery(repoId)}`;
    const first = await timed(url);
    const second = await timed(url);

    expect(first.ms).toBeLessThan(BUDGET_MS);
    expect(second.ms).toBeLessThan(BUDGET_MS);
    expect((first.body as AgentPerformanceDetail).runs).toBe(PER_PERIOD / 8);
  }, 120_000);
});
