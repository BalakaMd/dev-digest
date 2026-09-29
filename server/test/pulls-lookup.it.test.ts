/**
 * `GET /repos/:id/pulls/:number` (X1) — the PR resolver the MCP server uses to
 * turn `owner/repo#N` into a pr_id. DB-only, never GitHub: no MockGitHubClient
 * is even wired here, so a real network call would fail the test outright.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

d('GET /repos/:id/pulls/:number (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select()
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  it('resolves the seeded PR by repo + number', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls/482` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({ number: 482, title: 'Add rate limiting to public API endpoints' });
    expect(typeof body.id).toBe('string');
    expect(typeof body.status).toBe('string');
    await app.close();
  });

  it('404s on an unknown PR number for a known repo', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/pulls/999999` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('404s when the repo id does not match this PR', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const otherRepoId = '00000000-0000-0000-0000-000000000000';
    const res = await app.inject({ method: 'GET', url: `/repos/${otherRepoId}/pulls/482` });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });
});
