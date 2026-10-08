import { describe, it, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../helpers/pg.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { seed } from '../../src/db/seed.js';
import * as t from '../../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockSecretsProvider } from '../../src/adapters/mocks.js';
import type { IntentFacade } from '../../src/modules/intent/types.js';
import type { LLMProvider } from '@devdigest/shared';

/**
 * Shared harness of the eval it-tests (SPEC-06): Docker gating with the strict mode of
 * `pnpm verify:l06` (I2), a hermetic app (injected LLM + secrets + a throwing intent
 * facade + a `fetch` trap, NFR-8) and small seeding/polling helpers.
 */

export const hasDocker = await dockerAvailable();
/** `EVAL_VERIFY_STRICT=1` (set by `verify:l06`): no Docker is a failure, not a skip (I2). */
export const strict = process.env.EVAL_VERIFY_STRICT === '1';

/** `describe` for DB-backed suites: skips without Docker, or FAILS when strict. */
export function describeDb(name: string, fn: () => void): void {
  if (hasDocker) return describe(name, fn);
  if (strict) {
    return describe(name, () => {
      it('requires Docker (EVAL_VERIFY_STRICT=1)', () => {
        throw new Error('Docker is not available but EVAL_VERIFY_STRICT=1 requires the eval it-tests to run');
      });
    });
  }
  // eslint-disable-next-line no-console
  console.warn(`[${name}] Docker not available — skipping integration tests.`);
  return describe.skip(name, fn);
}

/** Any network call from an eval test is a bug (NFR-8): replace `fetch` with a trap. */
export function installFetchTrap(): { calls: string[] } {
  const calls: string[] = [];
  const original = globalThis.fetch;
  beforeAll(() => {
    globalThis.fetch = (async (input: unknown) => {
      calls.push(String(input));
      throw new Error(`eval tests must not use the network (fetch ${String(input)})`);
    }) as typeof fetch;
  });
  afterAll(() => {
    globalThis.fetch = original;
  });
  return { calls };
}

export interface EvalEnv {
  pg: PgFixture;
  workspaceId: string;
  /** Number of times the intent classifier facade was touched (must stay 0, AC-14). */
  intentCalls: { n: number };
}

/** Start Postgres, migrate, seed. Call inside `describeDb`. */
export function useEvalDb(): EvalEnv {
  const env = { intentCalls: { n: 0 } } as EvalEnv;
  beforeAll(async () => {
    env.pg = await startPg();
    await seed(env.pg.handle.db);
    const [ws] = await env.pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    env.workspaceId = ws!.id;
  });
  afterAll(async () => {
    await env.pg?.stop();
  });
  return env;
}

export interface MakeAppOptions {
  llm?: LLMProvider;
  /** Provider keys present in the secrets store; default `{ OPENAI_API_KEY: 'test' }`. */
  keys?: Record<string, string>;
  diff?: string;
}

/** The app under test: all adapters mocked, the intent facade throws if touched. */
export function makeApp(env: EvalEnv, opts: MakeAppOptions = {}) {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  const intent = new Proxy(
    {},
    {
      get: () => () => {
        env.intentCalls.n += 1;
        throw new Error('the intent classifier must not be used by eval runs');
      },
    },
  ) as unknown as IntentFacade;
  return buildApp({
    config,
    db: env.pg.handle.db,
    overrides: {
      git: new MockGitClient(opts.diff ? { diff: opts.diff } : {}),
      github: new MockGitHubClient(),
      secrets: new MockSecretsProvider(opts.keys ?? { OPENAI_API_KEY: 'test' }),
      intent,
      ...(opts.llm ? { llm: { openai: opts.llm } } : {}),
    },
  });
}

export type EvalApp = Awaited<ReturnType<typeof makeApp>>;

// ----------------------------------------------------------------- seeding

let seq = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

export async function createAgent(
  env: EvalEnv,
  o: { name?: string; prompt?: string; provider?: 'openai' | 'openrouter'; enabled?: boolean; model?: string } = {},
) {
  const [row] = await env.pg.handle.db
    .insert(t.agents)
    .values({
      workspaceId: env.workspaceId,
      name: o.name ?? uniq('agent'),
      provider: o.provider ?? 'openai',
      model: o.model ?? 'gpt-4o-mini',
      systemPrompt: o.prompt ?? 'You are a reviewer. GOOD prompt.',
      enabled: o.enabled ?? true,
    })
    .returning();
  return row!;
}

export const DIFF_A = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -1,3 +1,4 @@
 line1
+added2
 line3
 line4`;

export const DIFF_B = `diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -10,3 +10,4 @@
 ten
+eleven
 twelve
 thirteen`;

/** A PR with a diff of two files, optionally a review by `agentId` and findings. */
export async function seedPr(env: EvalEnv, o: { title?: string; body?: string } = {}) {
  const db = env.pg.handle.db;
  const name = uniq('repo');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId: env.workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId: env.workspaceId,
      repoId: repo!.id,
      number: 1,
      title: o.title ?? 'Add things',
      author: 'dev',
      branch: 'feat',
      base: 'main',
      headSha: 'abc123',
      additions: 2,
      deletions: 0,
      filesCount: 2,
      status: 'needs_review',
      body: o.body ?? 'PR body text',
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

export async function seedReview(env: EvalEnv, prId: string, agentId: string | null) {
  const [review] = await env.pg.handle.db
    .insert(t.reviews)
    .values({ workspaceId: env.workspaceId, prId, agentId, kind: 'review', verdict: 'comment', summary: 's', score: 80 })
    .returning();
  return review!;
}

export async function seedFinding(
  env: EvalEnv,
  reviewId: string,
  o: {
    file?: string;
    start?: number;
    end?: number;
    title?: string;
    accepted?: boolean;
    dismissed?: boolean;
    kind?: string;
  } = {},
) {
  const [row] = await env.pg.handle.db
    .insert(t.findings)
    .values({
      reviewId,
      file: o.file ?? 'src/a.ts',
      startLine: o.start ?? 2,
      endLine: o.end ?? 2,
      severity: 'WARNING',
      category: 'bug',
      title: o.title ?? 'Hardcoded Stripe Secret Key!',
      rationale: 'because',
      confidence: 0.9,
      kind: o.kind ?? 'finding',
      acceptedAt: o.accepted ? new Date() : null,
      dismissedAt: o.dismissed ? new Date() : null,
    })
    .returning();
  return row!;
}

// ------------------------------------------------------------------ polling

export async function waitFor<T>(
  fn: () => Promise<T>,
  done: (v: T) => boolean,
  timeoutMs = 15_000,
): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Poll `GET /eval-runs/:id` until the run left `running`. */
export async function waitRunFinished(app: EvalApp, runId: string) {
  const res = await waitFor(
    async () => (await app.inject({ method: 'GET', url: `/eval-runs/${runId}` })).json(),
    (b) => b.run.status !== 'running',
  );
  return res as {
    run: Record<string, any>;
    cases: Array<Record<string, any>>;
  };
}

/** A manual case on `agentId`, expecting `type` at `file:start-end` in `diff`. */
export async function addCase(
  app: EvalApp,
  agentId: string,
  o: {
    name: string;
    type?: 'must_find' | 'must_not_flag';
    file?: string;
    start?: number;
    end?: number;
    diff?: string;
    meta?: { title: string; body: string };
  },
) {
  const res = await app.inject({
    method: 'POST',
    url: `/agents/${agentId}/eval-cases`,
    payload: {
      name: o.name,
      input_diff: o.diff ?? DIFF_A,
      input_meta: o.meta ?? { title: 'T', body: 'B' },
      expected_output: [
        {
          type: o.type ?? 'must_find',
          file: o.file ?? 'src/a.ts',
          start_line: o.start ?? 2,
          end_line: o.end ?? 2,
        },
      ],
    },
  });
  if (res.statusCode !== 201) throw new Error(`addCase failed: ${res.statusCode} ${res.body}`);
  return res.json() as { id: string; name: string };
}
