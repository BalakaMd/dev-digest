/**
 * `GET /pulls/:id/history` end to end against a real Postgres (Testcontainers):
 * real repository + service, GitHub injected explicitly (see server/INSIGHTS.md
 * 2026-09-26). The response is validated against the shared contract.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { PrHistory, PrHistoryResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[history] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /pulls/:id/history (Testcontainers pg)', () => {
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

  async function newPr(paths: string[]) {
    const name = `history-${seq++}-${Date.now()}`;
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 50,
        title: 'Touch shared files',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'head-sha',
        status: 'needs_review',
      })
      .returning();
    await db.insert(t.prFiles).values(paths.map((path) => ({ prId: pr!.id, path, additions: 2, deletions: 1 })));
    return pr!.id;
  }

  it('no github injected → 200, degraded no_token, contract-valid', async () => {
    const [seeded] = await pg.handle.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(eq(t.pullRequests.number, 482));
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ url: `/pulls/${seeded!.id}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => PrHistoryResponse.parse(body)).not.toThrow();
    expect(body).toMatchObject({ history: [], degraded: true, degraded_reason: 'no_token' });
    await app.close();
  });

  it('with GitHub history → ranked items, parses as PrHistory', async () => {
    const prId = await newPr(['src/a.ts', 'src/b.ts']);
    const github = new MockGitHubClient({
      pathHistory: () => ({
        refFound: true,
        paths: [
          {
            path: 'src/a.ts',
            pulls: [
              { number: 3, title: 'One file', mergedAt: '2026-02-01T00:00:00Z', author: 'ann', changedFiles: 4 },
              { number: 4, title: 'Two files', mergedAt: '2026-01-01T00:00:00Z', author: 'bob', changedFiles: 5 },
            ],
          },
          {
            path: 'src/b.ts',
            pulls: [{ number: 4, title: 'Two files', mergedAt: '2026-01-01T00:00:00Z', author: 'bob', changedFiles: 5 }],
          },
        ],
      }),
    });
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github } });
    const res = await app.inject({ url: `/pulls/${prId}/history` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => PrHistory.parse(body)).not.toThrow();
    expect(body.degraded).toBe(false);
    expect(body.history.map((i: { pr_number: number }) => i.pr_number)).toEqual([4, 3]);
    expect(body.history[0].files_overlap).toEqual(['src/a.ts', 'src/b.ts']);
    await app.close();
  });

  it('unknown uuid → 404; non-uuid → 422', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db, overrides: { github: new MockGitHubClient() } });
    expect((await app.inject({ url: '/pulls/00000000-0000-4000-8000-000000000000/history' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/pulls/not-a-uuid/history' })).statusCode).toBe(422);
    await app.close();
  });
});
