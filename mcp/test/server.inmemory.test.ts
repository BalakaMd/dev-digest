import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer } from '../src/server.js';
import { DevDigestApi } from '../src/api/client.js';

const BASE_URL = 'http://localhost:3001';

const AGENT_ENABLED = {
  id: 'agent-1',
  name: 'General Reviewer',
  description: 'Reviews a PR diff for bugs.',
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  system_prompt: 'SECRET PROMPT TEXT',
  enabled: true,
  version: 1,
  strategy: 'single-pass',
  ci_fail_on: 'critical',
  repo_intel: true,
};

const REPO = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

const PR = {
  id: 'pr-1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  branch: 'feat/rate-limit',
  base: 'main',
  head_sha: 'abc123',
  additions: 10,
  deletions: 2,
  files_count: 3,
  status: 'needs_review',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function findingFixture(id: string, severity: 'CRITICAL' | 'WARNING' | 'SUGGESTION') {
  return {
    id,
    review_id: `rev-${id}`,
    severity,
    category: 'bug',
    title: `Finding ${id}`,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 2,
    rationale: 'because',
    suggestion: null,
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
  };
}

/** A router-style fake fetch, keyed by method + path. Each test overrides
 * only the routes it needs via `overrides`. */
function makeFetch(overrides: Record<string, (url: URL) => Response> = {}) {
  return vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${url.pathname}`;
    for (const [pattern, handler] of Object.entries(overrides)) {
      const [pMethod, pPath] = pattern.split(' ');
      if (pMethod !== method) continue;
      const regex = new RegExp('^' + pPath!.replace(/:\w+/g, '[^/]+') + '$');
      if (regex.test(url.pathname)) return handler(url);
    }
    throw new Error(`Unhandled fake fetch route: ${key}`);
  });
}

async function connectedClient(fetchImpl: ReturnType<typeof makeFetch> | typeof fetch) {
  const api = new DevDigestApi({ baseUrl: BASE_URL, fetchImpl });
  const server = createServer({ api, apiUrl: BASE_URL });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: 'test-client', version: '0.0.0' });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return { client, server };
}

describe('devdigest MCP server (in-memory)', () => {
  it('lists exactly the 5 devdigest_* tools with their annotations', async () => {
    const { client } = await connectedClient(makeFetch());
    const { tools } = await client.listTools();
    const names = tools.map((t) => t.name).sort();
    expect(names).toEqual(
      [
        'devdigest_get_blast_radius',
        'devdigest_get_conventions',
        'devdigest_get_findings',
        'devdigest_list_agents',
        'devdigest_run_review',
      ].sort(),
    );
    const runReview = tools.find((t) => t.name === 'devdigest_run_review')!;
    expect(runReview.annotations?.readOnlyHint).toBe(false);
    const listAgents = tools.find((t) => t.name === 'devdigest_list_agents')!;
    expect(listAgents.annotations?.readOnlyHint).toBe(true);
  });

  it('carries the instructions in the initialize result', async () => {
    const { client } = await connectedClient(makeFetch());
    expect(client.getInstructions()).toMatch(/DevDigest reviews pull requests/);
  });

  it('list_agents text never contains system_prompt', async () => {
    const fetchImpl = makeFetch({ 'GET /agents': () => jsonResponse([AGENT_ENABLED]) });
    const { client } = await connectedClient(fetchImpl);
    const result = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).not.toContain('SECRET PROMPT TEXT');
    expect(text).toContain('General Reviewer');
  });

  it('run_review happy path: terminal on the first poll', async () => {
    const runId = 'run-1';
    const fetchImpl = makeFetch({
      'GET /agents': () => jsonResponse([AGENT_ENABLED]),
      'GET /repos': () => jsonResponse([REPO]),
      'GET /repos/:id/pulls/:number': () => jsonResponse(PR),
      'GET /settings/secrets-status': () =>
        jsonResponse({ openai: true, anthropic: true, openrouter: true, github: true }),
      'POST /pulls/:id/review': () =>
        jsonResponse({ pr_id: PR.id, runs: [{ run_id: runId, agent_id: AGENT_ENABLED.id, agent_name: AGENT_ENABLED.name }], reviews: [] }),
      'GET /pulls/:id/runs': () =>
        jsonResponse([
          {
            run_id: runId,
            agent_id: AGENT_ENABLED.id,
            agent_name: AGENT_ENABLED.name,
            provider: 'openrouter',
            model: 'x',
            status: 'done',
            error: null,
            duration_ms: 1200,
            tokens_in: 100,
            tokens_out: 50,
            cost_usd: 0.001,
            findings_count: 1,
            grounding: '1/1',
            ran_at: '2026-06-01T00:00:00Z',
            score: 90,
            blockers: 0,
          },
        ]),
      'GET /pulls/:id/reviews': () =>
        jsonResponse([
          {
            id: 'rev-1',
            pr_id: PR.id,
            agent_id: AGENT_ENABLED.id,
            run_id: runId,
            agent_name: AGENT_ENABLED.name,
            kind: 'review',
            verdict: 'approve',
            summary: 'looks good',
            score: 90,
            model: 'x',
            created_at: '2026-06-01T00:00:00Z',
            findings: [findingFixture('f1', 'SUGGESTION')],
          },
        ]),
    });
    const { client } = await connectedClient(fetchImpl);
    const result = await client.callTool(
      { name: 'devdigest_run_review', arguments: { pr: 'acme/payments-api#482' } },
      undefined,
      { timeout: 5000 },
    );
    expect(result.isError).toBe(false);
    expect((result.structuredContent as { status: string }).status).toBe('completed');
  });

  it('run_review reports partial with run_ids once the deadline passes', async () => {
    vi.useFakeTimers();
    try {
      const runId = 'run-2';
      const fetchImpl = makeFetch({
        'GET /agents': () => jsonResponse([AGENT_ENABLED]),
        'GET /repos': () => jsonResponse([REPO]),
        'GET /repos/:id/pulls/:number': () => jsonResponse(PR),
        'GET /settings/secrets-status': () =>
          jsonResponse({ openai: true, anthropic: true, openrouter: true, github: true }),
        'POST /pulls/:id/review': () =>
          jsonResponse({ pr_id: PR.id, runs: [{ run_id: runId, agent_id: AGENT_ENABLED.id, agent_name: AGENT_ENABLED.name }], reviews: [] }),
        'GET /pulls/:id/runs': () =>
          jsonResponse([
            {
              run_id: runId,
              agent_id: AGENT_ENABLED.id,
              agent_name: AGENT_ENABLED.name,
              provider: 'openrouter',
              model: 'x',
              status: 'running',
              error: null,
              duration_ms: null,
              tokens_in: null,
              tokens_out: null,
              cost_usd: null,
              findings_count: null,
              grounding: null,
              ran_at: '2026-06-01T00:00:00Z',
              score: null,
              blockers: null,
            },
          ]),
        'GET /pulls/:id/reviews': () => jsonResponse([]),
      });
      const { client } = await connectedClient(fetchImpl);
      const callPromise = client.callTool(
        { name: 'devdigest_run_review', arguments: { pr: 'acme/payments-api#482' } },
        undefined,
        { timeout: 300_000, resetTimeoutOnProgress: false },
      );
      // Advance well past the 120s cap in 2s ticks (AbortSignal.timeout inside
      // the API client also uses real time, but every route here resolves
      // synchronously so no HTTP-level timeout fires).
      for (let i = 0; i < 65; i++) {
        await vi.advanceTimersByTimeAsync(2_000);
      }
      const result = await callPromise;
      expect(result.isError).toBe(false);
      expect((result.structuredContent as { status: string; runs: { run_id: string }[] }).status).toBe('partial');
      expect((result.structuredContent as { runs: { run_id: string }[] }).runs[0]!.run_id).toBe(runId);
    } finally {
      vi.useRealTimers();
    }
  }, 20_000);

  it('run_review with every run failed on a missing key: isError true + key hint', async () => {
    const runId = 'run-3';
    const fetchImpl = makeFetch({
      'GET /agents': () => jsonResponse([AGENT_ENABLED]),
      'GET /repos': () => jsonResponse([REPO]),
      'GET /repos/:id/pulls/:number': () => jsonResponse(PR),
      'GET /settings/secrets-status': () =>
        jsonResponse({ openai: true, anthropic: true, openrouter: false, github: true }),
      'POST /pulls/:id/review': () =>
        jsonResponse({ pr_id: PR.id, runs: [{ run_id: runId, agent_id: AGENT_ENABLED.id, agent_name: AGENT_ENABLED.name }], reviews: [] }),
      'GET /pulls/:id/runs': () => jsonResponse([]),
    });
    const { client } = await connectedClient(fetchImpl);
    const result = await client.callTool({ name: 'devdigest_run_review', arguments: { pr: 'acme/payments-api#482' } });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).toMatch(/API key configured/);
  });

  it('get_findings returns a pagination hint', async () => {
    const findings = Array.from({ length: 25 }, (_, i) => findingFixture(`f${i}`, 'SUGGESTION'));
    const fetchImpl = makeFetch({
      'GET /repos': () => jsonResponse([REPO]),
      'GET /repos/:id/pulls/:number': () => jsonResponse(PR),
      'GET /pulls/:id/runs': () => jsonResponse([]),
      'GET /pulls/:id/reviews': () =>
        jsonResponse([
          {
            id: 'rev-1',
            pr_id: PR.id,
            agent_id: AGENT_ENABLED.id,
            run_id: 'run-x',
            agent_name: AGENT_ENABLED.name,
            kind: 'review',
            verdict: 'comment',
            summary: 's',
            score: 70,
            model: 'x',
            created_at: '2026-06-01T00:00:00Z',
            findings,
          },
        ]),
    });
    const { client } = await connectedClient(fetchImpl);
    const result = await client.callTool({ name: 'devdigest_get_findings', arguments: { pr: 'acme/payments-api#482' } });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).toContain('more: call again with offset=');
  });

  it('get_conventions hints to run a scan when there is none', async () => {
    const fetchImpl = makeFetch({
      'GET /repos': () => jsonResponse([REPO]),
      'GET /repos/:id/conventions': () => jsonResponse({ scan: null, candidates: [], rejected: [] }),
    });
    const { client } = await connectedClient(fetchImpl);
    const result = await client.callTool({ name: 'devdigest_get_conventions', arguments: { repo: 'acme/payments-api' } });
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).toMatch(/run a scan/i);
  });

  it('get_blast_radius returns the not-implemented stub with no API call', async () => {
    const fetchImpl = makeFetch();
    const { client } = await connectedClient(fetchImpl);
    const result = await client.callTool({ name: 'devdigest_get_blast_radius', arguments: { pr: 'acme/payments-api#482' } });
    expect(result.isError).toBe(false);
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).toMatch(/not implemented yet/);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('API-unreachable → isError true, actionable text, no stack lines', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed: ECONNREFUSED');
    });
    const { client } = await connectedClient(fetchImpl as unknown as typeof fetch);
    const result = await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]!.text;
    expect(text).toContain('./scripts/dev.sh');
    expect(text).not.toMatch(/\bat \S+:\d+:\d+/);
  });

  it('never writes to stdout during a tool call', async () => {
    const spy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    try {
      const fetchImpl = makeFetch({ 'GET /agents': () => jsonResponse([AGENT_ENABLED]) });
      const { client } = await connectedClient(fetchImpl);
      await client.callTool({ name: 'devdigest_list_agents', arguments: {} });
      expect(spy).not.toHaveBeenCalled();
    } finally {
      spy.mockRestore();
    }
  });
});
