import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import type { FastifyInstance } from 'fastify';
import { dockerAvailable } from './helpers/pg.js';
import * as t from '../src/db/schema.js';
import { MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';
import {
  makePerfApp,
  rangeQuery,
  seedPerfFixture,
  usePerfDb,
  type PerfFixture,
} from './helpers/agent-performance.js';

/**
 * SPEC-10 AC-25 / AC-37 (security property) — both reads only read: no row is written, no review
 * run starts, and no model, embedding, price-look-up, GitHub or other network call is made.
 */
const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('Agent Performance reads are read-only and offline (real Postgres)', () => {
  const env = usePerfDb();
  const llm = {
    openai: new MockLLMProvider('openai'),
    anthropic: new MockLLMProvider('anthropic'),
    openrouter: new MockLLMProvider('openai'),
  };
  const github = new MockGitHubClient();
  const fetchCalls: string[] = [];
  const realFetch = globalThis.fetch;
  let app: FastifyInstance;
  let fx: PerfFixture;

  beforeAll(async () => {
    globalThis.fetch = (async (input: unknown) => {
      fetchCalls.push(String(input));
      throw new Error(`Agent Performance reads must not use the network (fetch ${String(input)})`);
    }) as typeof fetch;
    app = await makePerfApp(env, { github, llm });
    fx = await seedPerfFixture(env);
  });
  afterAll(async () => {
    globalThis.fetch = realFetch;
    await app?.close();
  });

  /** Row counts of every table a review run or a cost look-up could touch. */
  async function snapshot() {
    const db = env.pg.handle.db;
    const count = async (table: PgTable) =>
      Number((await db.select({ n: sql<number>`count(*)` }).from(table))[0]!.n);
    return {
      agentRuns: await count(t.agentRuns),
      runTraces: await count(t.runTraces),
      multiAgentRuns: await count(t.multiAgentRuns),
      reviews: await count(t.reviews),
      findings: await count(t.findings),
      agents: await count(t.agents),
      repos: await count(t.repos),
      pullRequests: await count(t.pullRequests),
      settings: await count(t.settings),
    };
  }

  it('writes nothing and calls no model, GitHub, price look-up or network', async () => {
    const llmSpy = vi.spyOn(app.container, 'llm');
    const githubSpy = vi.spyOn(app.container, 'github');
    const estimateSpy = vi.spyOn(app.container.priceBook, 'estimate');
    const refreshSpy = vi.spyOn(app.container.priceBook, 'refresh');
    const before = await snapshot();
    expect(before.agentRuns).toBeGreaterThan(10); // the snapshot sees the fixture

    const urls = [
      `/agent-performance?${rangeQuery(fx.repoId)}`,
      `/agents/${fx.agents.alpha}/performance?${rangeQuery(fx.repoId)}`,
      `/agents/${fx.agents.disabledIdle}/performance?${rangeQuery(fx.repoId)}`,
      `/agent-performance?${rangeQuery(fx.otherRepoId)}`,
      `/agents/${fx.agents.foreign}/performance?${rangeQuery(fx.repoId)}`, // 404 path
      `/agent-performance?repoId=nope&from=x&to=y`, // 422 path
    ];
    const statuses: number[] = [];
    for (const url of urls) {
      // twice: a repeated read must not change anything either
      for (let i = 0; i < 2; i++) statuses.push((await app.inject({ method: 'GET', url })).statusCode);
    }
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200, 200, 404, 404, 422, 422]);

    expect(await snapshot()).toEqual(before);
    expect(llmSpy).not.toHaveBeenCalled();
    expect(githubSpy).not.toHaveBeenCalled();
    expect(estimateSpy).not.toHaveBeenCalled();
    expect(refreshSpy).not.toHaveBeenCalled();
    for (const m of [...Object.values(llm)]) expect(m.calls).toEqual([]);
    expect(github.posted).toEqual([]);
    expect(github.openedPrs).toEqual([]);
    expect(github.committed).toEqual([]);
    expect(github.createdComments).toEqual([]);
    expect(github.workflowRunQueries).toEqual([]);
    expect(github.downloadedArtifacts).toEqual([]);
    expect(fetchCalls).toEqual([]);
  });

  it('the spies are live: a direct container call would be seen (guards against a vacuous test)', async () => {
    const llmSpy = vi.spyOn(app.container, 'llm');
    await app.container.llm('openai');
    expect(llmSpy).toHaveBeenCalledTimes(1);
    llmSpy.mockRestore();

    globalThis.fetch('https://example.invalid/').catch(() => undefined);
    expect(fetchCalls).toHaveLength(1);
    fetchCalls.length = 0;
  });
});
