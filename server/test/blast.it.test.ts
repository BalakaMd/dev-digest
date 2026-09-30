/**
 * `GET /pulls/:id/blast` end to end against a real Postgres (Testcontainers —
 * an isolated throw-away database, never the dev one): the persisted repo-intel
 * index is read through the real facade and repository, and the response is
 * validated against the shared contract. No LLM, GitHub or git is involved:
 * nothing is injected, so any such call would fail with a ConfigError.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { BlastRadius, PrBlastRadiusResponse } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[blast] Docker not available — skipping integration tests.');
}

const config = () =>
  loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'true' } as NodeJS.ProcessEnv);

const CHANGED = 'src/shared/ctx.ts';
const INDEXED_SHA = 'indexed-sha-0001';

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  async function newPr(files: string[]) {
    const name = `blast-${seq++}-${Date.now()}`;
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
        number: 1,
        title: 'Change a shared helper',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'head-sha',
        status: 'needs_review',
      })
      .returning();
    if (files.length > 0) {
      await db.insert(t.prFiles).values(files.map((path) => ({ prId: pr!.id, path })));
    }
    return { repoId: repo!.id, prId: pr!.id };
  }

  /** A small index: `CHANGED` declares getContext; two files call it; one route imports a caller. */
  async function indexRepo(repoId: string, status: 'full' | 'partial' | 'failed' = 'full') {
    const db = pg.handle.db;
    await db.insert(t.repoIndexState).values({
      repoId,
      lastIndexedSha: INDEXED_SHA,
      indexerVersion: 2,
      status,
      filesIndexed: 5,
      filesSkipped: 0,
    });
    await db.insert(t.symbols).values([
      { repoId, path: CHANGED, name: 'getContext', kind: 'function', line: 1 },
      { repoId, path: 'src/api/a.ts', name: 'handleA', kind: 'function', line: 1 },
      { repoId, path: 'src/api/b.ts', name: 'handleB', kind: 'function', line: 1 },
    ]);
    await db.insert(t.references).values([
      { repoId, fromPath: 'src/api/a.ts', toSymbol: 'getContext', line: 10, declFile: CHANGED },
      { repoId, fromPath: 'src/api/b.ts', toSymbol: 'getContext', line: 20, declFile: CHANGED },
      // The declaring file "calling" its own symbol must never be listed.
      { repoId, fromPath: CHANGED, toSymbol: 'getContext', line: 5, declFile: CHANGED },
      // Unresolved reference: asserted as a caller by nobody.
      { repoId, fromPath: 'src/api/unresolved.ts', toSymbol: 'getContext', line: 1, declFile: null },
    ]);
    await db.insert(t.fileRank).values(
      [CHANGED, 'src/api/a.ts', 'src/api/b.ts', 'src/api/unresolved.ts'].map((filePath, i) => ({
        repoId,
        filePath,
        pagerank: 0.4 - i / 10,
        hotness: 0,
        rank: 0.4 - i / 10,
        percentile: 50,
      })),
    );
    await db.insert(t.fileFacts).values([
      { repoId, filePath: 'src/api/a.ts', endpoints: ['GET /a'], crons: [] },
      { repoId, filePath: 'src/api/routes.ts', endpoints: ['GET /b'], crons: ['0 * * * *'] },
    ]);
    await db.insert(t.fileEdges).values([
      { repoId, fromFile: 'src/api/a.ts', toFile: CHANGED },
      { repoId, fromFile: 'src/api/b.ts', toFile: CHANGED },
      { repoId, fromFile: 'src/api/routes.ts', toFile: 'src/api/b.ts' },
    ]);
  }

  it('seeded PR (no clone, no index) → 200 with the no_data marker, empty map, valid contract', async () => {
    const [seeded] = await pg.handle.db
      .select({ id: t.pullRequests.id })
      .from(t.pullRequests)
      .where(eq(t.pullRequests.number, 482));
    const app = await buildApp({ config: config(), db: pg.handle.db });

    const res = await app.inject({ url: `/pulls/${seeded!.id}/blast` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      degraded_reason: 'no_data',
      indexed_sha: null,
    });
    expect(typeof body.summary).toBe('string');
    expect(() => BlastRadius.parse(body)).not.toThrow();
    expect(() => PrBlastRadiusResponse.parse(body)).not.toThrow();
    await app.close();
  });

  it('indexed repo: a shared helper shows >= 2 callers and >= 1 endpoint, never its own file', async () => {
    const { repoId, prId } = await newPr([CHANGED]);
    await indexRepo(repoId);
    const app = await buildApp({ config: config(), db: pg.handle.db });

    const res = await app.inject({ url: `/pulls/${prId}/blast` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(() => PrBlastRadiusResponse.parse(body)).not.toThrow();
    expect(() => BlastRadius.parse(body)).not.toThrow();
    expect(body).toMatchObject({ degraded: false, degraded_reason: null, indexed_sha: INDEXED_SHA });
    expect(body.changed_symbols).toEqual([{ name: 'getContext', file: CHANGED, kind: 'function' }]);

    expect(body.downstream).toHaveLength(1);
    const impact = body.downstream[0];
    expect(impact.symbol).toBe('getContext');
    expect(impact.callers).toEqual([
      { name: 'handleA', file: 'src/api/a.ts', line: 10 },
      { name: 'handleB', file: 'src/api/b.ts', line: 20 },
    ]);
    expect(impact.callers.map((c: { file: string }) => c.file)).not.toContain(CHANGED);
    expect(impact.callers.map((c: { file: string }) => c.file)).not.toContain('src/api/unresolved.ts');

    // GET /a is declared in a caller file; GET /b + the cron sit in a file importing caller b.ts.
    expect(impact.endpoints_affected).toEqual(['GET /a', 'GET /b']);
    expect(impact.crons_affected).toEqual(['0 * * * *']);
    expect(body.summary).toBe('1 changed symbol · 2 callers · 2 endpoints · 1 cron/job');
    await app.close();
  });

  it('a PR whose files declare nothing callable-from-elsewhere still returns 200 with an empty map', async () => {
    const { repoId, prId } = await newPr(['docs/readme.md']);
    await indexRepo(repoId);
    const app = await buildApp({ config: config(), db: pg.handle.db });

    const res = await app.inject({ url: `/pulls/${prId}/blast` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: false,
      indexed_sha: INDEXED_SHA,
    });
    await app.close();
  });

  it('a partial index still returns the map and flags index_partial', async () => {
    const { repoId, prId } = await newPr([CHANGED]);
    await indexRepo(repoId, 'partial');
    const app = await buildApp({ config: config(), db: pg.handle.db });

    const body = (await app.inject({ url: `/pulls/${prId}/blast` })).json();

    expect(body).toMatchObject({ degraded: true, degraded_reason: 'index_partial' });
    expect(body.downstream[0].callers).toHaveLength(2);
    await app.close();
  });

  it('a failed index returns an empty map with index_failed (no fallback scan)', async () => {
    const { repoId, prId } = await newPr([CHANGED]);
    await indexRepo(repoId, 'failed');
    const app = await buildApp({ config: config(), db: pg.handle.db });

    const res = await app.inject({ url: `/pulls/${prId}/blast` });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      changed_symbols: [],
      downstream: [],
      degraded: true,
      degraded_reason: 'index_failed',
      indexed_sha: null,
    });
    await app.close();
  });

  it('REPO_INTEL_ENABLED=false → flag_off marker, empty map', async () => {
    const { repoId, prId } = await newPr([CHANGED]);
    await indexRepo(repoId);
    const app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test', REPO_INTEL_ENABLED: 'false' } as NodeJS.ProcessEnv),
      db: pg.handle.db,
    });

    const body = (await app.inject({ url: `/pulls/${prId}/blast` })).json();

    expect(body).toMatchObject({ degraded: true, degraded_reason: 'flag_off', downstream: [] });
    await app.close();
  });

  it('404s for an unknown PR uuid', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ url: '/pulls/00000000-0000-0000-0000-000000000000/blast' });
    expect(res.statusCode).toBe(404);
    expect(res.json().error.code).toBe('not_found');
    await app.close();
  });

  it('422s for a non-uuid id, before the handler runs', async () => {
    const app = await buildApp({ config: config(), db: pg.handle.db });
    const res = await app.inject({ url: '/pulls/not-a-uuid/blast' });
    expect(res.statusCode).toBe(422);
    await app.close();
  });
});
