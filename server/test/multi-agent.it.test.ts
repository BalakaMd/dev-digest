import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import type { Review } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { defaultWorkspaceId, seedAgent, seedForeignWorkspace, seedPullRequest, waitFor } from './helpers/multi-agent.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

/** Hermetic intent: injected as `llm.openrouter` so no real OpenRouter call can happen. */
const INTENT_FIXTURE = { summary: 'Adds rate limiting.', in_scope: ['A rate limiter'], out_of_scope: [] };

/** One grounded finding (line 11) and one hallucinated (line 999). */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded Stripe secret introduced.',
  score: 42,
  findings: [
    {
      id: 'f-valid',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded Stripe secret key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live Stripe key is committed in source.',
      confidence: 0.95,
      kind: 'finding',
    },
    {
      id: 'f-halluc',
      severity: 'WARNING',
      category: 'bug',
      title: 'Phantom finding on a line not in the diff',
      file: 'src/config.ts',
      start_line: 999,
      end_line: 999,
      rationale: 'This line does not exist in the diff.',
      confidence: 0.5,
      kind: 'finding',
    },
  ],
};

/** MockGitClient that counts `diff` calls (AC-22: once per batch). */
class CountingGit extends MockGitClient {
  diffCalls = 0;
  override async diff(...args: Parameters<MockGitClient['diff']>) {
    this.diffCalls += 1;
    return super.diff(...args);
  }
}

/**
 * SPEC-08 T-6/T-7/T-8 — `POST /pulls/:id/review` with an agent set: one record, one
 * run per distinct agent, shared preparation, validation before any write, and the
 * legacy `{agentId}` / `{all}` shapes unchanged.
 */
d('multi-agent review trigger (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let git: CountingGit;
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
    git = new CountingGit({ diff: DIFF });
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
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

  const post = (prId: string, payload: unknown) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: payload as object });
  const recordsFor = (prId: string) =>
    pg.handle.db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.prId, prId));
  const runsFor = (prId: string) => pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, prId));

  /** The run is `done` BEFORE its trace is written (server/INSIGHTS) — poll the endpoint. */
  async function traceOf(runId: string) {
    return waitFor(
      async () => app.inject({ url: `/runs/${runId}/trace` }),
      (r) => r.statusCode === 200 && Array.isArray(r.json()?.log),
    ).then((r) => r.json() as { log: { msg: string }[] });
  }

  it('T-6 AC-19/22/25/56 NFR-6: agentIds [a,b,a] -> one record, two linked runs, shared preparation, findings grounded', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    const a = await seedAgent(pg.handle.db, workspaceId, { name: uniqName('A') });
    const b = await seedAgent(pg.handle.db, workspaceId, { name: uniqName('B') });
    git.diffCalls = 0;

    const res = await post(pr.id, { agentIds: [a.id, b.id, a.id] });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pr_id).toBe(pr.id);
    expect(body.reviews).toEqual([]);
    expect(body.runs.map((r: { agent_id: string }) => r.agent_id)).toEqual([a.id, b.id]);
    expect(body.runs.map((r: { agent_name: string }) => r.agent_name)).toEqual([a.name, b.name]);
    expect(typeof body.multi_agent_run_id).toBe('string');

    // the records exist before any agent has finished: 1 record, 2 linked runs
    const records = await recordsFor(pr.id);
    expect(records).toHaveLength(1);
    expect(records[0]!.id).toBe(body.multi_agent_run_id);
    const runIds: string[] = body.runs.map((r: { run_id: string }) => r.run_id);
    const linked = await pg.handle.db.select().from(t.agentRuns).where(inArray(t.agentRuns.id, runIds));
    expect(linked).toHaveLength(2);
    expect(linked.every((r) => r.multiAgentRunId === body.multi_agent_run_id)).toBe(true);
    // estimate recorded at trigger time (new agents have no history)
    expect(records[0]!.estimate).toEqual({ time_ms: null, cost_usd: null, agents_without_time: 2, agents_without_cost: 2 });

    const finished = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect(finished.map((r) => r.status)).toEqual(['done', 'done']);
    // AC-22: the diff was loaded once for the whole batch
    expect(git.diffCalls).toBe(1);

    // AC-25: counted in the PR run history and the Findings tab like any other run
    const history = (await app.inject({ url: `/pulls/${pr.id}/runs` })).json() as { run_id: string }[];
    expect(history.map((r) => r.run_id).sort()).toEqual([...runIds].sort());
    const reviews = (await app.inject({ url: `/pulls/${pr.id}/reviews` })).json() as {
      run_id: string;
      findings: { start_line: number }[];
    }[];
    expect(reviews).toHaveLength(2);
    for (const rv of reviews) expect(rv.findings.map((f) => f.start_line)).toEqual([11]); // hallucinated line 999 dropped

    // NFR-6: each run keeps its own trace, with the shared steps present in each
    for (const runId of runIds) {
      const log = (await traceOf(runId)).log.map((l) => l.msg);
      expect(log.some((m) => m.startsWith('Diff ready'))).toBe(true);
      expect(log.some((m) => /^Shared preparation \(diff \+ intent\) done \(\d+ms\)$/.test(m))).toBe(true);
      expect(log.some((m) => m.includes('Starting review with agent'))).toBe(true);
    }
  });

  it('T-7 AC-20: empty set, unknown id, disabled agent and a foreign-workspace agent are 400 and create nothing', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    const ok = await seedAgent(pg.handle.db, workspaceId);
    const disabled = await seedAgent(pg.handle.db, workspaceId, { name: uniqName('Sleeping'), enabled: false });
    const foreignAgent = await seedAgent(pg.handle.db, await seedForeignWorkspace(pg.handle.db));

    const cases: { agentIds: string[]; message?: RegExp }[] = [
      { agentIds: [] },
      { agentIds: ['00000000-0000-4000-8000-000000000000'] },
      { agentIds: [ok.id, disabled.id], message: new RegExp(disabled.name) },
      { agentIds: [foreignAgent.id] },
    ];
    for (const c of cases) {
      const res = await post(pr.id, { agentIds: c.agentIds });
      expect(res.statusCode, JSON.stringify(c)).toBe(400);
      expect(res.json().error.code).toBe('invalid_run_request');
      if (c.message) expect(res.json().error.message).toMatch(c.message);
    }
    // a malformed id never reaches the handler
    expect((await post(pr.id, { agentIds: ['nope'] })).statusCode).toBe(422);

    expect(await recordsFor(pr.id)).toHaveLength(0);
    expect(await runsFor(pr.id)).toHaveLength(0);
  });

  it('T-8 AC-52: {agentId} and {all} keep their shape and create no multi-agent record; mixing with agentIds is 400', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    const agent = await seedAgent(pg.handle.db, workspaceId);

    const single = await post(pr.id, { agentId: agent.id });
    expect(single.statusCode).toBe(200);
    expect(Object.keys(single.json()).sort()).toEqual(['pr_id', 'reviews', 'runs']);
    expect(single.json().runs).toHaveLength(1);

    const all = await post(pr.id, { all: true });
    expect(all.statusCode).toBe(200);
    expect(Object.keys(all.json()).sort()).toEqual(['pr_id', 'reviews', 'runs']);
    expect(all.json().runs.length).toBeGreaterThanOrEqual(1);

    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 + all.json().runs.length });
    expect(await recordsFor(pr.id)).toHaveLength(0);
    expect((await runsFor(pr.id)).every((r) => r.multiAgentRunId === null)).toBe(true);

    for (const mixed of [{ agentIds: [agent.id], all: true }, { agentIds: [agent.id], agentId: agent.id }]) {
      const res = await post(pr.id, mixed);
      expect(res.statusCode).toBe(400);
      expect(res.json().error.code).toBe('invalid_run_request');
    }
  });
});

let nameSeq = 0;
function uniqName(p: string) {
  return `${p}-${Date.now().toString(36)}-${nameSeq++}`;
}
