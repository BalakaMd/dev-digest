import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockContextDocStore,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
  MockSecretsProvider,
} from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[brief] Docker not available — skipping integration tests.');
}

const FILE = 'src/api/public/index.ts';
const ANSWER = {
  summary: 'Adds rate limiting to the public API.',
  risks: [
    { kind: 'behavior', title: 'Throttling', explanation: 'Clients may be limited.', severity: 'medium', file_refs: [FILE] },
    { kind: 'data', title: 'Invented', explanation: 'x', severity: 'low', file_refs: ['src/does/not/exist.ts'] },
  ],
  review_focus: [{ file: FILE, line: 2, reason: 'The limiter entry point.' }],
};

/**
 * `GET`/`POST /pulls/:id/brief` end to end against Postgres: empty → generate
 * → persist → stale once the PR head moves, and workspace scoping (a PR of
 * another workspace is a 404 that makes no model request). Hermetic: the
 * `openai` provider, secrets, GitHub, git and the context-document store are
 * all mocks, whatever key or filesystem the host has.
 */
d('brief module', () => {
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

  async function makeApp(llm = new MockLLMProvider('openai', { structured: ANSWER })) {
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({ OPENAI_API_KEY: 'sk-test-not-real' }),
        contextDocs: new MockContextDocStore(),
        llm: { openai: llm },
      },
    });
    return { app, llm };
  }

  async function newPr(ws: string = workspaceId) {
    const name = `brief-${seq++}-${Date.now()}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: ws, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: ws,
        repoId: repo!.id,
        number: 1,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'sha-1',
        status: 'needs_review',
        body: 'Adds a limiter to public endpoints.',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: FILE,
      additions: 2,
      deletions: 0,
      patch: '@@ -1,1 +1,3 @@ handler\n+limiter()\n+next()',
    });
    return pr!;
  }

  it('GET is empty before a generation, POST generates and persists, GET then returns the same brief', async () => {
    const { app, llm } = await makeApp();
    const pr = await newPr();

    const empty = await app.inject({ url: `/pulls/${pr.id}/brief` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ brief: null, stale: false });
    expect(llm.calls).toHaveLength(0); // reading never calls the model

    const post = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(post.statusCode).toBe(200);
    const { brief, stale } = post.json();
    expect(stale).toBe(false);
    expect(brief).toMatchObject({ summary: ANSWER.summary, head_sha: 'sha-1', provider: 'openai' });
    expect(brief.risks).toHaveLength(1); // the invented path was grounded away
    expect(brief.risks[0].file_refs).toEqual([FILE]);
    expect(brief.review_focus).toEqual(ANSWER.review_focus);
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);

    const get = await app.inject({ url: `/pulls/${pr.id}/brief` });
    expect(get.json()).toEqual({ brief, stale: false });
    await app.close();
  });

  it('reports stale once the PR head SHA moves past the stored brief', async () => {
    const { app } = await makeApp();
    const pr = await newPr();
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });

    await pg.handle.db.update(t.pullRequests).set({ headSha: 'sha-2' }).where(eq(t.pullRequests.id, pr.id));

    const res = await app.inject({ url: `/pulls/${pr.id}/brief` });
    expect(res.json()).toMatchObject({ stale: true, brief: { head_sha: 'sha-1' } });
    await app.close();
  });

  it('404s for an unknown id and for a PR of another workspace, with no model request', async () => {
    const { app, llm } = await makeApp();
    const [other] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Date.now()}` }).returning();
    const foreign = await newPr(other!.id);

    for (const id of [foreign.id, '00000000-0000-0000-0000-000000000000']) {
      expect((await app.inject({ url: `/pulls/${id}/brief` })).statusCode).toBe(404);
      expect((await app.inject({ method: 'POST', url: `/pulls/${id}/brief` })).statusCode).toBe(404);
    }
    expect(llm.calls).toHaveLength(0);
    const rows = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, foreign.id));
    expect(rows).toHaveLength(0);
    await app.close();
  });
});
