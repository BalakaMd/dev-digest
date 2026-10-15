import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import type { AgentPerformanceDetail, AgentPerformanceOverview } from '@devdigest/shared';
import { dockerAvailable } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import {
  RANGE,
  day,
  makePerfApp,
  rangeQuery,
  seedPerfFixture,
  usePerfDb,
  type PerfFixture,
} from './helpers/agent-performance.js';

/**
 * SPEC-10 — both Agent Performance reads against a real Postgres, driven through the app's own
 * request entry point. The fixture (helpers/agent-performance.ts) documents every seeded run; the
 * numbers below follow from it.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agent-performance] Docker not available — skipping integration tests.');
}

const close = (actual: number | null, expected: number) => {
  expect(actual).not.toBeNull();
  expect(actual as number).toBeCloseTo(expected, 9);
};

d('Agent Performance reads (real Postgres)', () => {
  const env = usePerfDb();
  let app: FastifyInstance;
  let fx: PerfFixture;

  // the app is built BEFORE the fixture: boot reaps `running` runs and the fixture has one on purpose
  beforeAll(async () => {
    app = await makePerfApp(env);
    fx = await seedPerfFixture(env);
  });
  afterAll(async () => {
    await app?.close();
  });

  const overview = async (repoId = fx.repoId, range = RANGE) => {
    const res = await app.inject({ method: 'GET', url: `/agent-performance?${rangeQuery(repoId, range)}` });
    expect(res.statusCode).toBe(200);
    return res.json() as AgentPerformanceOverview;
  };
  const detail = async (agentId: string, repoId = fx.repoId, range = RANGE) =>
    app.inject({ method: 'GET', url: `/agents/${agentId}/performance?${rangeQuery(repoId, range)}` });
  const rowOf = (o: AgentPerformanceOverview, agentId: string) => o.rows.find((r) => r.agent_id === agentId)!;

  describe('all-agents read (AC-19)', () => {
    it('answers the repository, the applied range and one row per listed agent in name order', async () => {
      const o = await overview();
      expect(o.repo).toEqual({ id: fx.repoId, full_name: 'acme/web' });
      expect(o.range).toEqual({ from: RANGE.from.toISOString(), to: RANGE.to.toISOString() });
      // disabled agent WITH a counted run is listed, disabled agent without one is not (AC-55);
      // the deleted agent has no row (AC-53); an enabled agent without runs keeps its row
      expect(o.rows.map((r) => r.name)).toEqual(['alpha', 'beta', 'dis-active', 'gamma']);
      expect(rowOf(o, fx.agents.disabledActive).enabled).toBe(false);
    });

    it('counts exactly the runs of the repository inside the range (AC-7, AC-8, AC-65)', async () => {
      const o = await overview();
      // counted: alpha 5 (a1 a2 a3 a5-multi-agent a6-CI 'ACME/Web'), beta 2 (incl. `from` itself),
      // dis-active 1, deleted agent 1. Not counted: running, `to` itself, after the range, before the range,
      // run of a deleted PR, run on acme/api, CI run of a repo that is not imported, other workspace.
      expect(o.totals.runs).toBe(9);
      expect(o.totals.failed).toBe(1);
      expect(rowOf(o, fx.agents.alpha).runs).toBe(5);
      expect(rowOf(o, fx.agents.beta).runs).toBe(2);
      expect(rowOf(o, fx.agents.disabledActive).runs).toBe(1);
      // cost of the excluded runs (99, 97, 98, 96, 95, 8, 9) would blow this up
      close(o.totals.total_cost_usd, 2.22);
    });

    it('prices: unpriced runs add nothing and are counted; cost is split by source with old and CI rows "unknown" (AC-10, AC-45)', async () => {
      const o = await overview();
      expect(o.totals.not_priced_runs).toBe(1);
      close(o.totals.cost_by_source.provider, 1.27);
      close(o.totals.cost_by_source.estimate, 0.25);
      close(o.totals.cost_by_source.mixed, 0.3);
      close(o.totals.cost_by_source.unknown, 0.4); // the CI run
    });

    it('rows carry the per-agent numbers (AC-9..AC-16, AC-58)', async () => {
      const o = await overview();
      const alpha = rowOf(o, fx.agents.alpha);
      expect(alpha).toMatchObject({ runs: 5, failed: 1 });
      close(alpha.avg_cost_usd, 0.25); // done + priced only: .1 .2 .3 .4
      close(alpha.avg_duration_ms, 2750);
      // 4 accepted / 2 dismissed from alpha's LOCAL runs; the 5 accepted findings attached to its CI run are ignored
      expect(alpha.accept).toMatchObject({ accepted: 4, dismissed: 2, decisions: 6, low_sample: true });
      close(alpha.accept.rate, 4 / 6);
      close(alpha.cost_per_accepted_usd, 0.6 / 4); // local priced cost / accepted
      expect(alpha.last_run_at).toBe(day(7).toISOString());

      const beta = rowOf(o, fx.agents.beta);
      close(beta.avg_cost_usd, 0.275);
      expect(beta.accept).toMatchObject({ accepted: 0, dismissed: 4, decisions: 4, rate: 0, low_sample: true });
      expect(beta.cost_per_accepted_usd).toBeNull(); // nothing accepted
      // Last run ignores the range: beta's latest run is in April
      expect(beta.last_run_at).toBe(new Date(Date.UTC(2026, 3, 15, 12)).toISOString());
    });

    it('an agent with no counted run in the range still has a row of zeros and nulls, and its older Last run (AC-16, AC-44)', async () => {
      const gamma = rowOf(await overview(), fx.agents.gamma);
      expect(gamma).toMatchObject({
        runs: 0,
        failed: 0,
        avg_cost_usd: null,
        avg_duration_ms: null,
        cost_per_accepted_usd: null,
        accept: { rate: null, accepted: 0, dismissed: 0, decisions: 0, low_sample: false },
      });
      expect(gamma.last_run_at).toBe(new Date(Date.UTC(2026, 1, 1, 12)).toISOString());
    });

    it('Avg accept rate is pooled over listed agents and deleted agents; the most-active agent is the busiest listed one (AC-15, AC-17)', async () => {
      const o = await overview();
      // accepted: alpha 4 + deleted agent 2; dismissed: alpha 2 + beta 4
      expect(o.totals.accept).toMatchObject({ accepted: 6, dismissed: 6, decisions: 12, rate: 0.5, low_sample: false });
      expect(o.totals.most_active).toMatchObject({ agent_id: fx.agents.alpha, name: 'alpha', runs: 5 });
    });

    it('cost breakdowns add up to Total cost; deleted agent and unknown model get one null slice each (AC-18, AC-53, AC-54)', async () => {
      const o = await overview();
      const sum = (xs: { cost_usd: number }[]) => xs.reduce((s, x) => s + x.cost_usd, 0);
      expect(Math.abs(sum(o.cost_by_agent) - o.totals.total_cost_usd)).toBeLessThan(1e-9);
      expect(Math.abs(sum(o.cost_by_model) - o.totals.total_cost_usd)).toBeLessThan(1e-9);

      expect(o.cost_by_agent.map((s) => s.agent_id)).toEqual([
        fx.agents.alpha,
        null, // deleted agent, 0.60
        fx.agents.beta,
        fx.agents.disabledActive,
      ]);
      expect(o.cost_by_agent[1]).toMatchObject({ agent_id: null, name: null });
      expect(o.cost_by_model.map((s) => s.model)).toEqual(['m-b', null, 'm-a', 'm-c']);
      close(o.cost_by_model[1]!.cost_usd, 0.6);
    });

    it('splits the range into 30 daily buckets that add up to Runs, and reads the previous period (AC-56, AC-57)', async () => {
      const o = await overview();
      expect(o.buckets).toHaveLength(30);
      expect(o.buckets[0]).toEqual({ start: RANGE.from.toISOString(), runs: 1 }); // `from` itself
      expect(o.buckets.reduce((s, b) => s + b.runs, 0)).toBe(o.totals.runs);
      expect(o.buckets.map((b) => b.runs).indexOf(0)).toBe(4); // Mar 5 had no counted run
      close(o.previous_period.total_cost_usd, 0.25);
      expect(o.previous_period.has_runs).toBe(true);
    });

    it('a repository with no run in the range has zero totals and a previous period without runs', async () => {
      const far = { from: new Date(Date.UTC(2025, 0, 1)), to: new Date(Date.UTC(2025, 0, 2)) };
      const o = await overview(fx.repoId, far);
      expect(o.totals).toMatchObject({ runs: 0, failed: 0, total_cost_usd: 0, not_priced_runs: 0, most_active: null });
      expect(o.totals.accept).toMatchObject({ rate: null, decisions: 0 });
      expect(o.previous_period).toEqual({ total_cost_usd: 0, has_runs: false });
      expect(o.buckets).toHaveLength(24); // a 24 h range → hourly buckets
    });

    it('another repository of the same workspace shows only its own runs (EC-37)', async () => {
      const o = await overview(fx.otherRepoId);
      expect(o.repo.full_name).toBe('acme/api');
      expect(o.totals.runs).toBe(1);
      close(o.totals.total_cost_usd, 97);
      expect(rowOf(o, fx.agents.alpha).runs).toBe(1);
    });

    it('reads the decision as stored at the time of the read (EC-15)', async () => {
      const db = env.pg.handle.db;
      const before = rowOf(await overview(), fx.agents.alpha);
      expect(before.accept.accepted).toBe(4);

      await db.update(t.findings).set({ acceptedAt: null }).where(eq(t.findings.id, fx.alphaAcceptedFindingId));
      try {
        const after = rowOf(await overview(), fx.agents.alpha);
        expect(after.accept).toMatchObject({ accepted: 3, dismissed: 2, decisions: 5 });
        const one = (await (await detail(fx.agents.alpha)).json()) as AgentPerformanceDetail;
        expect(one.undecided).toBe(4); // 3 + the toggled one
      } finally {
        await db
          .update(t.findings)
          .set({ acceptedAt: new Date('2026-03-20T00:00:00Z') })
          .where(eq(t.findings.id, fx.alphaAcceptedFindingId));
      }
      expect(rowOf(await overview(), fx.agents.alpha).accept.accepted).toBe(4);
    });

    it('never leaks the other workspace (NFR-2)', async () => {
      const body = JSON.stringify(await overview());
      expect(body).not.toContain('x-agent');
      expect(body).not.toContain(fx.foreignRepoId);
    });
  });

  describe('per-agent read (AC-20, AC-21, AC-22)', () => {
    it('returns the same row fields as the overview row, for every listed agent', async () => {
      const o = await overview();
      for (const row of o.rows) {
        const res = await detail(row.agent_id);
        expect(res.statusCode).toBe(200);
        const { repo, range, cost_by_model, not_priced_runs, cost_by_source, undecided, runs_by_source, ...same } =
          res.json() as AgentPerformanceDetail;
        expect(same, row.name).toEqual(row);
        expect(repo).toEqual({ id: fx.repoId, full_name: 'acme/web' });
        expect(range).toEqual(o.range);
        // extras exist and have the right types
        expect(Array.isArray(cost_by_model)).toBe(true);
        expect(typeof not_priced_runs).toBe('number');
        expect(typeof cost_by_source.unknown).toBe('number');
        expect(typeof undecided).toBe('number');
        expect(runs_by_source.local + runs_by_source.ci).toBe(row.runs);
      }
    });

    it('adds the agent’s cost by model, not-priced count, cost by source, undecided findings and runs per source', async () => {
      const a = (await (await detail(fx.agents.alpha)).json()) as AgentPerformanceDetail;
      expect(Object.fromEntries(a.cost_by_model.map((s) => [s.model, s.cost_usd]))).toMatchObject({
        'm-c': 0.4,
        'm-b': 0.3,
      });
      expect(a.cost_by_model).toHaveLength(3);
      expect(a.not_priced_runs).toBe(1);
      close(a.cost_by_source.provider, 0.1);
      close(a.cost_by_source.estimate, 0.2);
      close(a.cost_by_source.mixed, 0.3);
      close(a.cost_by_source.unknown, 0.4);
      expect(a.undecided).toBe(3); // 2 + 1 undecided on alpha's local runs
      expect(a.runs_by_source).toEqual({ local: 4, ci: 1 });
    });

    it('works for a disabled agent', async () => {
      const res = await detail(fx.agents.disabledActive);
      expect(res.statusCode).toBe(200);
      expect(res.json()).toMatchObject({ name: 'dis-active', enabled: false, runs: 1 });
    });

    it('an agent without a counted run answers 200 with zeros, nulls and an empty by-model breakdown (AC-22)', async () => {
      const res = await detail(fx.agents.disabledIdle);
      expect(res.statusCode).toBe(200);
      const body = res.json() as AgentPerformanceDetail;
      expect(body).toMatchObject({
        runs: 0,
        failed: 0,
        avg_cost_usd: null,
        avg_duration_ms: null,
        cost_per_accepted_usd: null,
        last_run_at: null,
        cost_by_model: [],
        not_priced_runs: 0,
        undecided: 0,
        runs_by_source: { local: 0, ci: 0 },
      });
      expect(body.accept).toEqual({ rate: null, accepted: 0, dismissed: 0, decisions: 0, low_sample: false });
    });
  });

  describe('unknown or foreign ids answer 404 (AC-23, NFR-2)', () => {
    it.each([
      ['an unknown repository', () => randomUUID()],
      ['a repository of another workspace', () => fx.foreignRepoId],
    ])('overview: %s', async (_name, repoId) => {
      const res = await app.inject({ method: 'GET', url: `/agent-performance?${rangeQuery(repoId())}` });
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });

    it.each([
      ['an unknown agent', () => randomUUID(), () => fx.repoId],
      ['an agent of another workspace', () => fx.agents.foreign, () => fx.repoId],
      ['an unknown repository', () => fx.agents.alpha, () => randomUUID()],
      ['a repository of another workspace', () => fx.agents.alpha, () => fx.foreignRepoId],
    ])('per-agent: %s', async (_name, agentId, repoId) => {
      const res = await detail(agentId(), repoId());
      expect(res.statusCode).toBe(404);
      expect(res.json().error.code).toBe('not_found');
    });
  });
});
