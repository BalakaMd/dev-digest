import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LatestMultiAgentRun, MultiAgentRun, ReviewEstimates, Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import {
  defaultWorkspaceId,
  seedAgent,
  seedForeignWorkspace,
  seedMultiAgentRun,
  seedPullRequest,
  waitFor,
} from './helpers/multi-agent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const NO_SUCH_ID = '00000000-0000-4000-8000-000000000000';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;
const INTENT_FIXTURE = { summary: 'Adds rate limiting.', in_scope: ['A rate limiter'], out_of_scope: [] };
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    { id: 'f-valid', severity: 'CRITICAL', category: 'security', title: 'Hardcoded Stripe secret key', file: 'src/config.ts', start_line: 11, end_line: 11, rationale: 'Key in source.', confidence: 0.95, kind: 'finding' },
    { id: 'f-halluc', severity: 'WARNING', category: 'bug', title: 'Phantom finding', file: 'src/config.ts', start_line: 999, end_line: 999, rationale: 'Not in the diff.', confidence: 0.5, kind: 'finding' },
  ],
};

/**
 * SPEC-08 T-10/T-11/T-12 — the read side: `GET /multi-agent-runs/:id`,
 * `GET /pulls/:id/multi-agent-runs/latest`, `GET /review-estimates`, built on rows seeded
 * directly (no LLM) plus one real run for the trace content.
 */
d('multi-agent review reads (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        secrets: new MockSecretsProvider({}),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          openrouter: new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: INTENT_FIXTURE } }),
        },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  const read = async (id: string) => {
    const res = await app.inject({ url: `/multi-agent-runs/${id}` });
    return { status: res.statusCode, body: res.json() as MultiAgentRun };
  };
  const nm = (p: string) => `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  describe('GET /multi-agent-runs/:id', () => {
    it('T-10 AC-26/32: payload of a still-running batch — ordered columns, groups, conflicts, latest log, no totals yet', async () => {
      const db = pg.handle.db;
      const { pr } = await seedPullRequest(db, workspaceId, { title: 'Rate limiting', number: 7 });
      const [alpha, beta, gamma] = [
        await seedAgent(db, workspaceId, { name: nm('Alpha') }),
        await seedAgent(db, workspaceId, { name: nm('Beta') }),
        await seedAgent(db, workspaceId, { name: nm('Gamma') }),
      ];
      const estimate = { time_ms: 5000, cost_usd: 0.1, agents_without_time: 0, agents_without_cost: 1 };
      const seeded = await seedMultiAgentRun(db, {
        workspaceId,
        prId: pr.id,
        estimate,
        runs: [
          // inserted out of name order on purpose
          { agentId: gamma.id, status: 'running' },
          { agentId: beta.id, costUsd: null, review: { score: 55, findings: [{ start: 7, end: 9, severity: 'CRITICAL', title: 'Beta finding' }] } },
          { agentId: alpha.id, costUsd: 0.02, durationMs: 3000, tokensIn: 100, tokensOut: 20, review: { score: 90, summary: 'Alpha summary', findings: [{ start: 5, end: 7, title: 'Alpha finding' }] } },
        ],
      });
      const gammaRun = seeded.runs[0]!;
      app.container.runBus.publish(gammaRun.runId, 'info', 'Calling model gpt-4.1');
      app.container.runBus.publish(gammaRun.runId, 'info', 'Map: reviewing src/a.ts');

      const { status, body } = await read(seeded.id);

      expect(status).toBe(200);
      expect(body).toMatchObject({
        id: seeded.id,
        pr_id: pr.id,
        repo_id: pr.repoId,
        pr_number: 7,
        pr_title: 'Rate limiting',
        agent_count: 3,
        estimate,
        total_duration_ms: null, // gamma still runs
        cost_incomplete: true, // beta has no cost and gamma none yet
      });
      expect(body.columns.map((c) => c.agent_id)).toEqual([alpha.id, beta.id, gamma.id]);
      const [a, b, g] = body.columns;
      expect(a).toMatchObject({ status: 'done', score: 90, summary: 'Alpha summary', cost_usd: 0.02, tokens_in: 100, tokens_out: 20, latest_log: null });
      expect(a!.findings.map((f) => f.title)).toEqual(['Alpha finding']);
      expect(b!.findings.map((f) => f.severity)).toEqual(['CRITICAL']);
      expect(g).toMatchObject({ status: 'running', latest_log: 'Map: reviewing src/a.ts', findings: [] });

      // overlapping 5-7 / 7-9 findings of two agents form one group and one conflict row
      expect(body.groups).toHaveLength(1);
      expect(body.groups[0]!.members.map((m) => m.finding_id).sort()).toEqual(
        [...seeded.runs[1]!.findingIds, ...seeded.runs[2]!.findingIds].sort(),
      );
      expect(body.conflicts).toHaveLength(1);
      expect(body.conflicts[0]).toMatchObject({ file: 'src/a.ts', line: 5, is_conflict: true });
      expect(body.conflicts[0]!.takes.map((c) => c.state)).toEqual(['flagged', 'flagged', 'running']);
    });

    it('T-10 AC-26: totals appear once every run ended — wall-clock to the last finish and the cost sum', async () => {
      const db = pg.handle.db;
      const { pr } = await seedPullRequest(db, workspaceId);
      const x = await seedAgent(db, workspaceId);
      const y = await seedAgent(db, workspaceId);
      const seeded = await seedMultiAgentRun(db, {
        workspaceId,
        prId: pr.id,
        runs: [
          { agentId: x.id, endedAfterMs: 3000, costUsd: 0.01 },
          { agentId: y.id, status: 'failed', error: 'boom', endedAfterMs: 8000, costUsd: 0.02 },
        ],
      });
      const { body } = await read(seeded.id);
      expect(body.total_duration_ms).toBe(8000);
      expect(body.total_cost_usd).toBeCloseTo(0.03, 10);
      expect(body.cost_incomplete).toBe(false);
      expect(body.columns.find((c) => c.agent_id === y.id)).toMatchObject({ status: 'failed', error: 'boom' });
    });

    it('T-10 NFR-3: an unknown id and another workspace’s run are both 404 (no existence leak)', async () => {
      const db = pg.handle.db;
      const foreignWs = await seedForeignWorkspace(db);
      const { pr } = await seedPullRequest(db, foreignWs);
      const foreignAgent = await seedAgent(db, foreignWs);
      const foreign = await seedMultiAgentRun(db, {
        workspaceId: foreignWs,
        prId: pr.id,
        runs: [{ agentId: foreignAgent.id, review: { findings: [{}] } }],
      });

      const unknown = await app.inject({ url: `/multi-agent-runs/${NO_SUCH_ID}` });
      const other = await app.inject({ url: `/multi-agent-runs/${foreign.id}` });
      expect(unknown.statusCode).toBe(404);
      expect(other.statusCode).toBe(404);
      expect(other.json()).toEqual(unknown.json());
      expect(JSON.stringify(other.json())).not.toContain(foreignAgent.name);
      // a malformed id never reaches the handler
      expect((await app.inject({ url: '/multi-agent-runs/not-a-uuid' })).statusCode).toBe(422);
    });

    it('T-10 AC-25/36 NFR-6: a real agentIds run is readable, and its trace keeps the grounding drop with its reason', async () => {
      const db = pg.handle.db;
      const { pr } = await seedPullRequest(db, workspaceId);
      const agent = await seedAgent(db, workspaceId);
      const trigger = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentIds: [agent.id] } });
      const { multi_agent_run_id: id, runs } = trigger.json() as { multi_agent_run_id: string; runs: { run_id: string }[] };
      await waitForPrRuns(db, pr.id, { expected: 1 });

      // `done` is written before the trace (server/INSIGHTS): poll the endpoint.
      const trace = (
        await waitFor(
          async () => app.inject({ url: `/runs/${runs[0]!.run_id}/trace` }),
          (r) => r.statusCode === 200,
        )
      ).json() as { stats: { grounding: string }; log: { msg: string }[] };
      expect(trace.stats.grounding).toBe('1/2 passed');
      expect(trace.log.map((l) => l.msg)).toContain(
        'grounding dropped "Phantom finding": lines 999-999 do not intersect any diff hunk in \'src/config.ts\'',
      );

      const { body } = await read(id);
      expect(body.columns).toHaveLength(1);
      expect(body.columns[0]).toMatchObject({ status: 'done', latest_log: null });
      expect(body.columns[0]!.findings.map((f) => f.start_line)).toEqual([11]);
      expect(body.total_duration_ms).not.toBeNull();
    });
  });

  describe('GET /pulls/:id/multi-agent-runs/latest', () => {
    it('T-11 AC-59: the newest run by start time wins (not insertion order); {latest:null} when none', async () => {
      const db = pg.handle.db;
      const { pr } = await seedPullRequest(db, workspaceId);
      const agent = await seedAgent(db, workspaceId);
      const get = async () => (await app.inject({ url: `/pulls/${pr.id}/multi-agent-runs/latest` })).json() as LatestMultiAgentRun;

      expect(await get()).toEqual({ latest: null });

      const newer = await seedMultiAgentRun(db, { workspaceId, prId: pr.id, ranAt: new Date('2026-10-02T10:00:00Z'), runs: [{ agentId: agent.id }] });
      await seedMultiAgentRun(db, { workspaceId, prId: pr.id, ranAt: new Date('2026-10-01T10:00:00Z'), runs: [{ agentId: agent.id }] });

      expect(await get()).toEqual({ latest: { id: newer.id, ran_at: '2026-10-02T10:00:00.000Z' } });
    });

    it('T-11 NFR-3: another workspace’s PR is 404', async () => {
      const foreignWs = await seedForeignWorkspace(pg.handle.db);
      const { pr } = await seedPullRequest(pg.handle.db, foreignWs);
      expect((await app.inject({ url: `/pulls/${pr.id}/multi-agent-runs/latest` })).statusCode).toBe(404);
      expect((await app.inject({ url: `/pulls/${NO_SUCH_ID}/multi-agent-runs/latest` })).statusCode).toBe(404);
    });
  });

  describe('GET /review-estimates', () => {
    it('T-11 AC-15/16: medians of the newest 10 done runs that have the value, per metric; no history -> nulls', async () => {
      const db = pg.handle.db;
      const hist = await seedAgent(db, workspaceId, { name: nm('Hist') });
      const fresh = await seedAgent(db, workspaceId, { name: nm('Fresh') });
      const base = new Date('2026-09-01T00:00:00Z').getTime();
      // 12 done runs, run i started i minutes after base: duration i*1000 ms; the two newest are unpriced.
      await db.insert(t.agentRuns).values(
        Array.from({ length: 12 }, (_, k) => {
          const i = k + 1;
          return {
            workspaceId,
            agentId: hist.id,
            ranAt: new Date(base + i * 60_000),
            status: 'done',
            durationMs: i * 1000,
            costUsd: i > 10 ? null : i * 0.01,
          };
        }),
      );
      // runs that must not count: failed, running, cancelled
      await db.insert(t.agentRuns).values([
        { workspaceId, agentId: hist.id, ranAt: new Date(base + 99 * 60_000), status: 'failed', durationMs: 999_000, costUsd: 9 },
        { workspaceId, agentId: hist.id, ranAt: new Date(base + 98 * 60_000), status: 'running' },
        { workspaceId, agentId: hist.id, ranAt: new Date(base + 97 * 60_000), status: 'cancelled', durationMs: 888_000, costUsd: 8 },
      ]);
      // another workspace's runs of the same shape must not leak in
      const foreignWs = await seedForeignWorkspace(db);
      const foreignAgent = await seedAgent(db, foreignWs);

      const { estimates } = (await app.inject({ url: '/review-estimates' })).json() as ReviewEstimates;
      const byId = new Map(estimates.map((e) => [e.agent_id, e]));

      // duration window = runs 3..12 -> median (7000+8000)/2; cost window = runs 1..10 -> median (0.05+0.06)/2
      expect(byId.get(hist.id)).toMatchObject({ duration_ms: 7500, runs: 10, cost_runs: 10 });
      expect(byId.get(hist.id)!.cost_usd).toBeCloseTo(0.055, 10);
      expect(byId.get(fresh.id)).toEqual({ agent_id: fresh.id, duration_ms: null, cost_usd: null, runs: 0, cost_runs: 0 });
      expect(byId.has(foreignAgent.id)).toBe(false);
    });
  });

  describe('decisions and cancellation on a multi-agent run', () => {
    it('T-12 AC-40: a finding accepted through the existing action shows on the multi-agent read', async () => {
      const db = pg.handle.db;
      const { pr } = await seedPullRequest(db, workspaceId);
      const agent = await seedAgent(db, workspaceId);
      const seeded = await seedMultiAgentRun(db, { workspaceId, prId: pr.id, runs: [{ agentId: agent.id, review: { findings: [{ title: 'Decide me' }] } }] });
      const findingId = seeded.runs[0]!.findingIds[0]!;

      expect((await read(seeded.id)).body.columns[0]!.findings[0]).toMatchObject({ accepted_at: null, dismissed_at: null });
      expect((await app.inject({ method: 'POST', url: `/findings/${findingId}/accept` })).statusCode).toBe(200);
      expect((await read(seeded.id)).body.columns[0]!.findings[0]!.accepted_at).not.toBeNull();
      expect((await app.inject({ method: 'POST', url: `/findings/${findingId}/dismiss` })).statusCode).toBe(200);
      expect((await read(seeded.id)).body.columns[0]!.findings[0]).toMatchObject({ accepted_at: null });
      expect((await read(seeded.id)).body.columns[0]!.findings[0]!.dismissed_at).not.toBeNull();
    });

    it('T-12 AC-54/55: cancelling one running run leaves the other running; cancelling the rest ends the batch', async () => {
      const db = pg.handle.db;
      const { pr } = await seedPullRequest(db, workspaceId);
      const [x, y] = [await seedAgent(db, workspaceId), await seedAgent(db, workspaceId)];
      const seeded = await seedMultiAgentRun(db, {
        workspaceId,
        prId: pr.id,
        runs: [{ agentId: x.id, status: 'running' }, { agentId: y.id, status: 'running' }],
      });
      const [rx, ry] = seeded.runs.map((r) => r.runId);
      const statuses = async () => Object.fromEntries((await read(seeded.id)).body.columns.map((c) => [c.run_id, c.status]));

      expect((await app.inject({ method: 'POST', url: `/runs/${rx}/cancel` })).statusCode).toBe(200);
      expect(await statuses()).toEqual({ [rx!]: 'cancelled', [ry!]: 'running' });
      expect((await read(seeded.id)).body.total_duration_ms).toBeNull();
      const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, rx!));
      expect(row!.finishedAt).not.toBeNull();

      // "Cancel remaining" = the same action on every still-running run
      expect((await app.inject({ method: 'POST', url: `/runs/${ry}/cancel` })).statusCode).toBe(200);
      expect(await statuses()).toEqual({ [rx!]: 'cancelled', [ry!]: 'cancelled' });
      expect((await read(seeded.id)).body.total_duration_ms).not.toBeNull();
    });
  });
});
