import { describe, it, expect } from 'vitest';
import { dockerAvailable } from '../helpers/pg.js';
import * as t from '../../src/db/schema.js';
import { insertAgent, insertRepo, makeApp, uniq, useCiDb } from './it-env.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci perf] Docker not available — skipping integration tests.');
}

/** T-24b — the CI Runs page's first page of 50 with 10,000 stored CI runs (NFR-4). */
d('CI runs list at volume (real Postgres)', () => {
  const env = useCiDb();

  it('returns the first page of 50, newest first, in under 1 s with 10,000 CI rows', async () => {
    const agent = await insertAgent(env);
    const repoName = `acme/${uniq('volume')}`;
    await insertRepo(env, repoName);
    const db = env.pg.handle.db;

    const base = Date.parse('2026-01-01T00:00:00Z');
    const rows = Array.from({ length: 10_000 }, (_, i) => ({
      workspaceId: env.workspaceId,
      agentId: agent.id,
      ranAt: new Date(base + i * 1000),
      provider: 'openrouter',
      model: 'm',
      status: 'done',
      source: 'ci' as const,
      findingsCount: i % 5,
      repo: repoName,
      externalPrNumber: i % 50,
      actionsRunId: String(i),
      actionsRunAttempt: 1,
      verdict: 'comment',
    }));
    for (let i = 0; i < rows.length; i += 1000) await db.insert(t.agentRuns).values(rows.slice(i, i + 1000));

    const app = await makeApp(env);
    await app.inject({ method: 'GET', url: '/ci/runs?limit=50' }); // warm the app and the connection

    const t0 = performance.now();
    const res = await app.inject({ method: 'GET', url: '/ci/runs?limit=50' });
    const elapsed = performance.now() - t0;

    expect(res.statusCode).toBe(200);
    const page = res.json();
    expect(page.items).toHaveLength(50);
    expect(page.next_cursor).toEqual(expect.any(String));
    expect(page.items[0].ran_at).toBe(new Date(base + 9_999 * 1000).toISOString());
    expect(elapsed).toBeLessThan(1000);

    const second = (await app.inject({ method: 'GET', url: `/ci/runs?limit=50&cursor=${encodeURIComponent(page.next_cursor)}` })).json();
    expect(second.items[0].ran_at).toBe(new Date(base + 9_949 * 1000).toISOString());
    await app.close();
  }, 120_000);
});
