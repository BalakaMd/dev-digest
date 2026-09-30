import { describe, it, expect, vi } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { ApiUnreachableError, ApiHttpError, ApiContractError } from '../src/api/errors.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const AGENT_FIXTURE = {
  id: 'agent-1',
  name: 'General Reviewer',
  description: 'Reviews a PR diff.',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  system_prompt: 'You review code.',
  enabled: true,
  version: 1,
};

describe('DevDigestApi', () => {
  it('parses a successful response against the shared schema', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([AGENT_FIXTURE]));
    const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: fetchImpl as never });
    const agents = await api.listAgents();
    expect(agents).toHaveLength(1);
    expect(agents[0]!.name).toBe('General Reviewer');
    expect(fetchImpl).toHaveBeenCalledWith('http://localhost:3001/agents', expect.objectContaining({ method: 'GET' }));
  });

  it('wraps a fetch rejection as ApiUnreachableError', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    });
    const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: fetchImpl as never });
    await expect(api.listAgents()).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  it('wraps a timeout (AbortSignal.timeout) as ApiUnreachableError', async () => {
    const fetchImpl = vi.fn(async () => {
      const err = new DOMException('The operation was aborted', 'AbortError');
      throw err;
    });
    const api = new DevDigestApi({
      baseUrl: 'http://localhost:3001',
      fetchImpl: fetchImpl as never,
      timeoutMs: 1,
    });
    await expect(api.listAgents()).rejects.toBeInstanceOf(ApiUnreachableError);
  });

  it('maps a structured error envelope to ApiHttpError with code/message', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 'not_found', message: 'Repo not found' } }, 404),
    );
    const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: fetchImpl as never });
    await expect(api.listAgents()).rejects.toMatchObject({
      status: 404,
      code: 'not_found',
      message: 'Repo not found',
    });
  });

  it('maps HTTP 429 to a rate_limited ApiHttpError', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 429, { 'retry-after': '5' }));
    const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: fetchImpl as never });
    const err = await api.listAgents().catch((e) => e);
    expect(err).toBeInstanceOf(ApiHttpError);
    expect((err as ApiHttpError).status).toBe(429);
    expect((err as ApiHttpError).code).toBe('rate_limited');
  });

  it('raises ApiContractError when the body fails safeParse', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse([{ not: 'an agent' }]));
    const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: fetchImpl as never });
    await expect(api.listAgents()).rejects.toBeInstanceOf(ApiContractError);
  });

  it('lookupPull returns null on a 404 (PR not imported) instead of throwing', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: { code: 'not_found', message: 'Pull request not found' } }, 404),
    );
    const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', fetchImpl: fetchImpl as never });
    await expect(api.lookupPull('repo-1', 482)).resolves.toBeNull();
  });
});
