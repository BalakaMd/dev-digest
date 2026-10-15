import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type { LLMProvider, RunCostSource, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

/**
 * SPEC-10 AC-45 (write side, EC-28) — a successful local run stores the cost source reported by the
 * engine next to its cost; a run without a cost, and a failed run, store none. (The `unknown` read for
 * old and CI rows is asserted in agent-performance.it.test.ts.)
 */
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

const REVIEW = { verdict: 'approve', summary: 'fine', score: 100, findings: [] };

/** What the scripted provider answers for a given agent model. */
type Script = { costUsd: number | null; costSource?: RunCostSource } | 'throw';
const SCRIPTS: Record<string, Script> = {
  'm-provider': { costUsd: 0.0123, costSource: 'provider' },
  'm-mixed': { costUsd: 0.02, costSource: 'mixed' },
  'm-untagged': { costUsd: 0.003 }, // an adapter that reports no tag at all (OpenAI/Anthropic/mocks)
  'm-unpriced': { costUsd: null, costSource: 'estimate' },
  'm-broken': 'throw',
};

const scriptedLlm: LLMProvider = {
  id: 'openai',
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    const script = SCRIPTS[req.model];
    if (script === 'throw') throw new Error('provider exploded');
    if (!script) throw new Error(`no script for model ${req.model}`);
    return {
      data: REVIEW as unknown as T,
      model: req.model,
      tokensIn: 10,
      tokensOut: 5,
      costUsd: script.costUsd,
      ...(script.costSource ? { costSource: script.costSource } : {}),
      raw: JSON.stringify(REVIEW),
      attempts: 1,
    };
  },
  async listModels() {
    return [];
  },
  async complete(): Promise<never> {
    throw new Error('not used');
  },
  async embed(): Promise<number[][]> {
    return [];
  },
};

let seq = 0;

d('run cost source is stored with the run (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /** Run one review with an agent on `model`; returns the stored agent_runs row. */
  async function reviewWith(model: string) {
    const db = pg.handle.db;
    const app = await buildApp({
      config: config(),
      db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        secrets: new MockSecretsProvider({}),
        llm: {
          openai: scriptedLlm,
          // best-effort intent derivation must never reach a real provider
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: {
              IntentClassification: { summary: 'x', in_scope: [], out_of_scope: [] },
            },
          }),
        },
      },
    });
    const name = `cost-src-${seq++}`;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'T',
        author: 'a',
        branch: 'b',
        base: 'main',
        headSha: 'abc',
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Agent ${name}`, provider: 'openai', model, system_prompt: 'review' },
      })
    ).json();
    const res = await app.inject({ method: 'POST', url: `/pulls/${pr!.id}/review`, payload: { agentId: agent.id } });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(db, pr!.id, { expected: 1 });
    const [row] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, res.json().runs[0].run_id));
    await app.close();
    return row!;
  }

  it.each<{ model: string; costSource: RunCostSource; costUsd: number }>([
    { model: 'm-provider', costSource: 'provider', costUsd: 0.0123 },
    { model: 'm-mixed', costSource: 'mixed', costUsd: 0.02 },
    { model: 'm-untagged', costSource: 'estimate', costUsd: 0.003 },
  ])('a done run on $model stores cost_source "$costSource" with its cost', async ({ model, costSource, costUsd }) => {
    const run = await reviewWith(model);
    expect(run.status).toBe('done');
    expect(run.source).toBe('local');
    expect(run.costUsd).toBeCloseTo(costUsd, 10);
    expect(run.costSource).toBe(costSource);
  });

  it('a done run with no cost (unpriced model) stores no cost and no cost source', async () => {
    const run = await reviewWith('m-unpriced');
    expect(run.status).toBe('done');
    expect(run.costUsd).toBeNull();
    expect(run.costSource).toBeNull();
  });

  it('a failed run stores no cost and no cost source', async () => {
    const run = await reviewWith('m-broken');
    expect(run.status).toBe('failed');
    expect(run.costUsd).toBeNull();
    expect(run.costSource).toBeNull();
  });
});
