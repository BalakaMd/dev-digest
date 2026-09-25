import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { IntentRepository } from '../src/modules/intent/repository.js';
import type { UpsertIntentValues } from '../src/modules/intent/types.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[intent] Docker not available — skipping integration tests.');
}

const FIXTURE = {
  summary: 'Adds rate limiting to public API endpoints.',
  in_scope: ['A token-bucket limiter middleware'],
  out_of_scope: ['Auth changes'],
};

/**
 * `GET`/`POST /pulls/:id/intent` end to end against Postgres: none → derive →
 * persist → staleness once the PR head moves → re-derive overwrites.
 * Hermetic: an `llm.openrouter` mock is ALWAYS injected so this never makes a
 * real OpenRouter call, whatever key is configured on the host machine.
 */
d('intent module', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let seq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(opts: { extraction?: unknown } = {}) {
    return buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        llm: { openrouter: new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: opts.extraction ?? FIXTURE } }) },
      },
    });
  }

  async function newPr() {
    const name = `intent-${seq++}-${Date.now()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'sha-1',
        status: 'needs_review',
        body: 'Adds a limiter to public endpoints so nobody can hammer them.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/api/public/index.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,1 +1,2 @@ handler',
    });
    return pr!;
  }

  it('GET returns null before any intent was derived', async () => {
    const app = await makeApp();
    const pr = await newPr();
    const res = await app.inject({ url: `/pulls/${pr.id}/intent` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ intent: null });
    await app.close();
  });

  it('POST derives and persists; GET then returns the same record', async () => {
    const app = await makeApp();
    const pr = await newPr();
    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });
    expect(post.statusCode).toBe(200);
    const record = post.json();
    expect(record).toMatchObject({
      pr_id: pr.id,
      summary: FIXTURE.summary,
      in_scope: FIXTURE.in_scope,
      out_of_scope: FIXTURE.out_of_scope,
      head_sha: 'sha-1',
      stale: false,
      provider: 'openrouter',
    });

    const get = await app.inject({ url: `/pulls/${pr.id}/intent` });
    expect(get.json()).toEqual({ intent: record });
    await app.close();
  });

  it('404s for a PR outside the workspace (a random uuid)', async () => {
    const app = await makeApp();
    const res = await app.inject({ url: '/pulls/00000000-0000-0000-0000-000000000000/intent' });
    expect(res.statusCode).toBe(404);
    const postRes = await app.inject({
      method: 'POST',
      url: '/pulls/00000000-0000-0000-0000-000000000000/intent',
    });
    expect(postRes.statusCode).toBe(404);
    await app.close();
  });

  it('reports stale once the PR head SHA moves past the derived intent', async () => {
    const app = await makeApp();
    const pr = await newPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` });

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, pr.id));

    const res = await app.inject({ url: `/pulls/${pr.id}/intent` });
    expect(res.json().intent).toMatchObject({ stale: true, head_sha: 'sha-1' });
    await app.close();
  });

  it('re-derives on a second POST, overwriting the record and advancing derived_at', async () => {
    const app = await makeApp();
    const pr = await newPr();
    const first = (await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })).json();

    await new Promise((r) => setTimeout(r, 10));
    const second = (
      await app.inject({ method: 'POST', url: `/pulls/${pr.id}/intent` })
    ).json();

    expect(second.pr_id).toBe(first.pr_id);
    expect(new Date(second.derived_at).getTime()).toBeGreaterThan(new Date(first.derived_at).getTime());

    const get = (await app.inject({ url: `/pulls/${pr.id}/intent` })).json();
    expect(get.intent).toEqual(second);
    await app.close();
  });

  describe('IntentRepository — workspace scoping (repository level, no HTTP)', () => {
    function upsertValues(overrides: Partial<UpsertIntentValues> = {}): UpsertIntentValues {
      return {
        summary: FIXTURE.summary,
        inScope: FIXTURE.in_scope,
        outOfScope: FIXTURE.out_of_scope,
        confidence: 'low',
        sources: [],
        headSha: 'sha-1',
        provider: 'openrouter',
        model: 'deepseek/deepseek-v4-flash',
        tokensIn: 10,
        tokensOut: 20,
        costUsd: 0.001,
        promptTokensEst: 30,
        ...overrides,
      };
    }

    it('getIntent returns nothing, and upsert writes nothing, for a PR outside the workspace', async () => {
      const repo = new IntentRepository(pg.handle.db);
      const pr = await newPr(); // owned by `workspaceId`

      const owned = await repo.upsert(workspaceId, pr.id, upsertValues());
      expect(owned).toMatchObject({ summary: FIXTURE.summary });
      expect(await repo.getIntent(workspaceId, pr.id)).toMatchObject({ summary: FIXTURE.summary });

      const [otherWs] = await pg.handle.db
        .insert(t.workspaces)
        .values({ name: `other-${seq++}-${Date.now()}` })
        .returning();

      // Cross-workspace read: nothing comes back, even though the row exists.
      expect(await repo.getIntent(otherWs!.id, pr.id)).toBeUndefined();

      // Cross-workspace write: rejected, and the existing row is untouched.
      const before = await repo.getIntent(workspaceId, pr.id);
      const result = await repo.upsert(
        otherWs!.id,
        pr.id,
        upsertValues({ summary: 'HACKED — written by another workspace' }),
      );
      expect(result).toBeUndefined();
      const after = await repo.getIntent(workspaceId, pr.id);
      expect(after).toEqual(before);
      expect(after!.summary).not.toContain('HACKED');
    });
  });
});
