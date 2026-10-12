import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { defaultWorkspaceId, seedAgent, seedPullRequest, waitFor } from './helpers/multi-agent.js';
import { ScriptedLLM } from './eval/scripted-llm.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient, MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const INTENT_FIXTURE = { summary: 'Adds rate limiting.', in_scope: ['A rate limiter'], out_of_scope: [] };

/** MockGitClient whose `diff` can be made to fail (the shared diff load, AC-24). */
class SwitchableGit extends MockGitClient {
  failDiff = false;
  override async diff(...args: Parameters<MockGitClient['diff']>) {
    if (this.failDiff) throw new Error('git diff exploded');
    return super.diff(...args);
  }
}

/**
 * SPEC-08 T-9 — the executor starts every agent of a batch without waiting for the
 * others (AC-21), isolates failures (AC-23) and fails every run when the shared diff
 * load fails (AC-24).
 */
d('review executor: concurrent batch (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let app: Awaited<ReturnType<typeof buildApp>>;
  // Two scripted providers; each test (re)configures their gate / answer script.
  const openai = new ScriptedLLM({ respond: () => [] });
  const anthropic = new ScriptedLLM({ respond: () => [] });
  const git = new SwitchableGit();
  const releases: Array<() => void> = [];

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git,
        secrets: new MockSecretsProvider({}),
        llm: {
          openai,
          anthropic,
          openrouter: new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: INTENT_FIXTURE } }),
        },
      },
    });
  });
  afterEach(() => {
    git.failDiff = false;
    openai.setGate(undefined);
    anthropic.setGate(undefined);
    openai.setRespond(() => []);
    anthropic.setRespond(() => []);
    openai.calls.length = 0;
    anthropic.calls.length = 0;
    while (releases.length) releases.pop()!(); // never leave a deadlocked run behind
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  /** Resolves once `p` has received its first model call (the call is recorded before its gate). */
  function firstCallOf(p: ScriptedLLM): Promise<void> {
    return new Promise((resolve) => {
      const timer = setInterval(() => {
        if (p.calls.length > 0) {
          clearInterval(timer);
          resolve();
        }
      }, 5);
      releases.push(() => clearInterval(timer));
    });
  }

  /**
   * Mutual barrier: each provider answers only after the OTHER has received its first
   * call. A sequential executor deadlocks whichever agent it runs first.
   */
  function armMutualBarrier() {
    openai.setGate(firstCallOf(anthropic));
    anthropic.setGate(firstCallOf(openai));
  }

  const post = (prId: string, payload: object) =>
    app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload });

  async function agentPair(tag: string) {
    const a = await seedAgent(pg.handle.db, workspaceId, { name: `${tag}-A-${Date.now()}`, provider: 'openai' });
    const b = await seedAgent(pg.handle.db, workspaceId, { name: `${tag}-B-${Date.now()}`, provider: 'anthropic' });
    return { a, b };
  }

  it('AC-21: an agent set starts every agent without waiting (mutual barrier would deadlock a sequential run)', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    const { a, b } = await agentPair('set');
    armMutualBarrier();

    const res = await post(pr.id, { agentIds: [a.id, b.id] });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, timeoutMs: 8_000 });

    expect(runs.map((r) => r.status)).toEqual(['done', 'done']);
    expect(openai.calls.length).toBeGreaterThan(0);
    expect(anthropic.calls.length).toBeGreaterThan(0);
  });

  it('AC-21: the legacy {all:true} trigger is concurrent too', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    // only the two scripted agents are enabled in this workspace
    await pg.handle.db.update(t.agents).set({ enabled: false }).where(eq(t.agents.workspaceId, workspaceId));
    const { a, b } = await agentPair('all');
    armMutualBarrier();

    const res = await post(pr.id, { all: true });
    expect(res.statusCode).toBe(200);
    expect(res.json().runs.map((r: { agent_id: string }) => r.agent_id).sort()).toEqual([a.id, b.id].sort());
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, timeoutMs: 8_000 });

    expect(runs.map((r) => r.status)).toEqual(['done', 'done']);
    expect(res.json().multi_agent_run_id).toBeUndefined();
  });

  it('AC-23: a failing agent run is recorded failed with error text and trace; the other run still ends done', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    const { a, b } = await agentPair('iso');
    anthropic.setRespond(() => {
      throw new Error('boom-provider');
    });

    const body = (await post(pr.id, { agentIds: [a.id, b.id] })).json();
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2, timeoutMs: 8_000 });

    const byAgent = new Map(
      (await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).map((r) => [r.agentId, r]),
    );
    expect(byAgent.get(a.id)!.status).toBe('done');
    expect(byAgent.get(b.id)!.status).toBe('failed');
    expect(byAgent.get(b.id)!.error).toContain('boom-provider');

    const failedRunId = body.runs.find((r: { agent_id: string }) => r.agent_id === b.id).run_id;
    const trace = await waitFor(
      async () => app.inject({ url: `/runs/${failedRunId}/trace` }),
      (r) => r.statusCode === 200,
    );
    expect((trace.json().log as { msg: string }[]).some((l) => l.msg.startsWith('Run failed'))).toBe(true);
  });

  it('AC-24: when the shared diff load fails, every run of the batch is failed with the same error text', async () => {
    const { pr } = await seedPullRequest(pg.handle.db, workspaceId);
    const { a, b } = await agentPair('diff');
    // loadDiff tolerates a failing `git diff` (falls back to the stored patches), so the
    // load only fails when the fallback read fails as well: break both.
    git.failDiff = true;
    class BrokenPatches extends ReviewRepository {
      override getPrFiles(): ReturnType<ReviewRepository['getPrFiles']> {
        return Promise.reject(new Error('patches unavailable'));
      }
    }
    const repo = new BrokenPatches(pg.handle.db);
    const created = await repo.createMultiAgentRun({
      workspaceId,
      prId: pr.id,
      estimate: null,
      targets: [a, b].map((x) => ({ agentId: x.id, provider: x.provider, model: x.model })),
    });
    const pull = (await repo.getPull(workspaceId, pr.id))!;
    const repoRow = (await repo.getRepo(pull.repoId))!;

    await new ReviewRunExecutor(app.container, repo, app.container.agentsRepo).executeRuns(
      workspaceId,
      pull,
      repoRow,
      [a, b].map((agent, i) => ({ agent, runId: created.runIds[i]! })),
    );

    const rows = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id));
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.status)).toEqual(['failed', 'failed']);
    expect(new Set(rows.map((r) => r.error)).size).toBe(1);
    expect(rows[0]!.error).toContain('Failed to load PR diff: patches unavailable');
    expect(openai.calls.length + anthropic.calls.length).toBe(0); // no agent started
    for (const r of rows) {
      const stored = await repo.getRunTrace(r.id);
      expect(stored?.log.some((l) => l.msg.includes('Failed to load PR diff'))).toBe(true);
    }
  });
});
