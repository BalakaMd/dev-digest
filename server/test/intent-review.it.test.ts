import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[intent-review] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/** One hunk covering new lines 10-14; findings at 11/12/13 are all grounded. */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,6 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
+  legacyDebugFlag: true,
+  extraNoise: 1,
   redisUrl: x,`;

/** One in-scope WARNING, one out-of-scope CRITICAL, one out-of-scope WARNING — all grounded. */
const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Adds a config flag; touches unrelated debug flags too.',
  score: 40,
  findings: [
    {
      id: 'f-in',
      severity: 'WARNING',
      category: 'bug',
      title: 'In-scope: hardcoded Stripe key',
      file: 'src/config.ts',
      start_line: 11,
      end_line: 11,
      rationale: 'A live key is committed in source.',
      confidence: 0.9,
      kind: 'finding',
      scope: 'in',
    },
    {
      id: 'f-out-critical',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Out-of-scope: legacy debug flag left enabled',
      file: 'src/config.ts',
      start_line: 12,
      end_line: 12,
      rationale: 'Unrelated to this PR but a real security issue.',
      confidence: 0.9,
      kind: 'finding',
      scope: 'out',
    },
    {
      id: 'f-out-warning',
      severity: 'WARNING',
      category: 'style',
      title: 'Out-of-scope: noisy extra field',
      file: 'src/config.ts',
      start_line: 13,
      end_line: 13,
      rationale: 'Unrelated cosmetic nit.',
      confidence: 0.6,
      kind: 'finding',
      scope: 'out',
    },
  ],
};

const INTENT_FIXTURE = {
  summary: 'Adds the Stripe key to config.',
  in_scope: ['The Stripe key constant'],
  out_of_scope: ['Debug flags', 'Unrelated config fields'],
};

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `intent-review-${repoSeq++}-${Date.now()}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 7,
      title: 'Add Stripe key to config',
      author: 'marisa.koch',
      branch: 'feat/stripe-key',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 3,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Adds the Stripe key constant used by the payments client.',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 3,
    deletions: 0,
    patch: DIFF.split('\n').slice(3).join('\n'),
  });
  return { repo: repo!, pr: pr! };
}

/**
 * Review run wiring (S5): the executor derives an intent before the per-agent
 * loop, injects `## PR intent` into the prompt, and the scope filter drops
 * out-of-scope findings except the one CRITICAL signal. Hermetic: `secrets`
 * is an EMPTY mock so `GITHUB_TOKEN` never resolves to a real value (the
 * intent classifier's GitHub port stays unreachable), whatever key is
 * configured on the host machine; `llm.openrouter` is always mocked too.
 */
d('review run: intent + scope filter wiring', () => {
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

  function makeApp(opts: { withOpenrouter: boolean }) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ diff: DIFF }),
        secrets: new MockSecretsProvider({}),
        llm: {
          openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }),
          ...(opts.withOpenrouter
            ? {
                openrouter: new MockLLMProvider('openai', {
                  structuredBySchema: { IntentClassification: INTENT_FIXTURE },
                }),
              }
            : {}),
        },
      },
    });
  }

  async function runReviewAndTrace(app: Awaited<ReturnType<typeof makeApp>>, prId: string) {
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: 'Sec', provider: 'openai', model: 'gpt-4.1', system_prompt: 'sec' },
      })
    ).json();
    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${prId}/review`,
      payload: { agentId: agent.id },
    });
    const runId = res.json().runs[0].run_id;
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    for (let i = 0; i < 200; i++) {
      const traceRes = await app.inject({ url: `/runs/${runId}/trace` });
      if (traceRes.statusCode === 200 && traceRes.json()?.prompt_assembly) return traceRes.json();
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`trace for run ${runId} was never persisted`);
  }

  it('injects the derived intent and drops out-of-scope findings, keeping one CRITICAL signal', async () => {
    const app = await makeApp({ withOpenrouter: true });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const trace = await runReviewAndTrace(app, pr.id);
    expect(trace.prompt_assembly.intent).toContain('## PR intent');
    expect(trace.prompt_assembly.intent_tokens).toBeGreaterThan(0);
    expect(trace.log.some((l: { msg: string }) => l.msg.startsWith('Scope filter:'))).toBe(true);

    const reviews = (await app.inject({ url: `/pulls/${pr.id}/reviews` })).json();
    expect(reviews).toHaveLength(1);
    const findings = reviews[0].findings as { title: string; scope: string | null }[];
    expect(findings.map((f) => f.title).sort()).toEqual([
      'In-scope: hardcoded Stripe key',
      'Out-of-scope: legacy debug flag left enabled',
    ]);
    const kept = new Map(findings.map((f) => [f.title, f.scope]));
    expect(kept.get('In-scope: hardcoded Stripe key')).toBe('in');
    expect(kept.get('Out-of-scope: legacy debug flag left enabled')).toBe('out');

    // A review run auto-derived the intent (none was stored beforehand) — it
    // is now available directly via GET, not just embedded in the trace.
    const intentGet = (await app.inject({ url: `/pulls/${pr.id}/intent` })).json();
    expect(intentGet.intent).toMatchObject({ summary: INTENT_FIXTURE.summary });
    await app.close();
  });

  it('with no OpenRouter key, the review still succeeds — intent null, logged as skipped', async () => {
    const app = await makeApp({ withOpenrouter: false });
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const trace = await runReviewAndTrace(app, pr.id);
    expect(trace.prompt_assembly.intent).toBeNull();
    expect(trace.log.some((l: { msg: string }) => l.msg.includes('Intent: skipped'))).toBe(true);

    const reviews = (await app.inject({ url: `/pulls/${pr.id}/reviews` })).json();
    // No intent → no scope filter → all 3 grounded findings are kept as-is.
    expect(reviews[0].findings).toHaveLength(3);
    expect(reviews[0].findings.every((f: { scope: string | null }) => f.scope === null)).toBe(true);

    const intentGet = (await app.inject({ url: `/pulls/${pr.id}/intent` })).json();
    expect(intentGet.intent).toBeNull();
    await app.close();
  });
});
