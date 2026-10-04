import { describe, it, expect, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { ContextDocsService } from '../src/modules/context-docs/service.js';

/**
 * No-DB route smoke tests via app.inject(). `/health` and the validation/error
 * envelope don't touch the database (postgres-js connects lazily), so these run
 * without Docker. DB-backed routes are covered in integration.test.ts.
 */
const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

describe('routes (no DB)', () => {
  it('GET /health → ok', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok' });
    await app.close();
  });

  it('POST /settings/test-connection (github) returns structured ConnTestResult', async () => {
    const app = await buildApp({
      config,
      overrides: { github: new MockGitHubClient({ login: 'octocat' }) },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'github' },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.provider).toBe('github');
    expect(body.ok).toBe(true);
    expect(body.message).toContain('octocat');
    await app.close();
  });

  it('POST /settings/test-connection (openai) uses injected LLM listModels', async () => {
    const app = await buildApp({
      config,
      overrides: {
        llm: { openai: new MockLLMProvider('openai', { models: [{ id: 'gpt-4.1', provider: 'openai' }] }) },
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'openai' },
    });
    expect(res.json().ok).toBe(true);
    await app.close();
  });

  it('returns 422 structured error on invalid body', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'POST',
      url: '/settings/test-connection',
      payload: { provider: 'not-a-provider' },
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /repos/:id/pulls/:number → 422 on a non-uuid repo id', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/pulls/1' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('context-docs routes are served by the container\'s lazy contextDocsService (no DB needed to boot)', async () => {
    const app = await buildApp({ config });
    // the module plugin resolves `container.contextDocsService` while registering;
    // booting at all proves the getter assembles without touching the database,
    // and the same instance is handed to every consumer.
    // (boolean assertions: a failing object diff would dump the whole container)
    expect(app.container.contextDocsService instanceof ContextDocsService).toBe(true);
    expect(app.container.contextDocsService === app.container.contextDocsService).toBe(true);

    // the list route is registered and its schema runs before the handler (422, not 404)
    const res = await app.inject({ method: 'GET', url: '/repos/not-a-uuid/context-docs' });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });

  it('GET /repos/:id/pulls/:number → 422 on a non-numeric PR number', async () => {
    const app = await buildApp({ config });
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${'0'.repeat(8)}-0000-0000-0000-${'0'.repeat(12)}/pulls/abc`,
    });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.code).toBe('validation_error');
    await app.close();
  });
});
