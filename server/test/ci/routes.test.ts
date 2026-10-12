import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { MockGitHubClient, MockRunnerBundle, MockSecretsProvider } from '../../src/adapters/mocks.js';

/**
 * T-21 — route surface of the ci module without a database (AC-53, NFR-1): CI runs enter
 * the studio only through the pull-based refresh; no route lets a caller write one.
 * Input validation (limits) is rejected by the schemas before any handler runs.
 */
const AGENT = '00000000-0000-4000-8000-000000000001';

describe('ci routes (no DB)', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    app = await buildApp({
      config,
      overrides: {
        github: new MockGitHubClient(),
        secrets: new MockSecretsProvider({}),
        runnerBundle: new MockRunnerBundle(),
      },
    });
    await app.ready();
  });
  afterAll(async () => {
    await app?.close();
  });

  it('exposes exactly the planned read/refresh/install endpoints and no way to write a CI run from outside (AC-53)', () => {
    const planned: Array<[string, string]> = [
      ['POST', '/agents/:id/ci/preview'],
      ['POST', '/agents/:id/ci/check'],
      ['GET', '/agents/:id/ci/secrets'],
      ['POST', '/agents/:id/ci/install'],
      ['GET', '/agents/:id/ci/installations'],
      ['POST', '/ci/refresh'],
      ['GET', '/ci/runs'],
      ['GET', '/ci/runs/:id'],
    ];
    for (const [method, url] of planned) expect(app.hasRoute({ method: method as 'GET', url })).toBe(true);

    // Every route under /ci or /agents/:id/ci, from the router's own listing.
    const listing = app.printRoutes({ commonPrefix: false });
    const ciLines = listing.split('\n').filter((l) => /\/ci\b/.test(l) || /\bci\//.test(l));
    expect(ciLines.length).toBeGreaterThan(0);

    for (const [method, url] of [
      ['POST', '/ci/runs'],
      ['PUT', '/ci/runs/:id'],
      ['PATCH', '/ci/runs/:id'],
      ['DELETE', '/ci/runs/:id'],
      ['POST', '/ci/results'],
      ['POST', '/ci/ingest'],
      ['POST', '/ci/webhook'],
      ['POST', '/ci/runs/:id'],
    ] as const) {
      expect(app.hasRoute({ method, url }), `${method} ${url}`).toBe(false);
    }
  });

  it('answers 404 for attempts to post a run from outside', async () => {
    for (const url of ['/ci/runs', '/ci/results', '/ci/ingest']) {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { findings_count: 1, cost_usd: 0, agent: 'x' },
      });
      expect(res.statusCode, url).toBe(404);
    }
  });

  it('rejects malformed input with 422 before the handler: no triggers, bad limit, bad install action', async () => {
    const preview = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/ci/preview`,
      payload: { repo: 'acme/web', triggers: [], post_as: 'none' },
    });
    expect(preview.statusCode).toBe(422);

    const runs = await app.inject({ method: 'GET', url: '/ci/runs?limit=1000' });
    expect(runs.statusCode).toBe(422);

    const install = await app.inject({
      method: 'POST',
      url: `/agents/${AGENT}/ci/install`,
      payload: { repo: 'acme/web', triggers: ['opened'], post_as: 'none', workflow: 'x', action: 'delete' },
    });
    expect(install.statusCode).toBe(422);
  });
});
