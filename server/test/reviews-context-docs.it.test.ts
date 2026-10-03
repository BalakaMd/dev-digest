import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import type { Review, RunTrace, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockSecretsProvider,
  type MockLLMOptions,
} from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[reviews-context-docs.it] Docker not available — skipping integration tests.');
}

/**
 * Project context documents in a real review run (SPEC-01 — AC-5, 9, 27, 31, 32,
 * 33, 34, 35, 36, 37, 38, 39, 43, 48, 49, 64, 65, 77, 78; NFR-4).
 *
 * Full run through `POST /pulls/:id/review` with a mock LLM, a real Postgres
 * (testcontainers) and real temp-dir working copies + local-document folder.
 * The assertions read the persisted trace (the document the trace drawer
 * renders), the persisted findings and the exact messages the model received.
 *
 * Needs Docker; skipped without it. The pure pieces (resolve / budget / dedup /
 * citation filter) have DB-free coverage in `reviews-context-docs.test.ts`.
 */

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'comment',
  summary: 'Nothing blocking.',
  score: 80,
  findings: [],
};

const INTENT_FIXTURE = { summary: 'Adds rate limiting.', in_scope: [], out_of_scope: [] };

/** A mock model whose Review call can run a hook first, or fail. */
class ScriptedLLM extends MockLLMProvider {
  beforeReview?: () => Promise<void> | void;
  failWith?: Error;

  override async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName === 'Review') {
      await this.beforeReview?.();
      if (this.failWith) throw this.failWith;
    }
    return super.completeStructured(req);
  }

  /** Review calls only (the intent classifier never goes to this provider). */
  get reviewCalls() {
    return this.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as { schemaName: string }).schemaName === 'Review',
    );
  }

  /** The `user` message of the first Review call. */
  userMessage(): string {
    const req = this.reviewCalls[0]?.req as { messages: Array<{ role: string; content: string }> };
    return req.messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');
  }
}

/** A git client whose working copies live under a temp dir (the store and the executor share it). */
class TmpGit extends MockGitClient {
  constructor(private root: string) {
    super({ diff: DIFF });
  }
  override clonePathFor(repo: { owner: string; name: string }): string {
    return join(this.root, repo.owner, repo.name);
  }
}

d('project context documents in a review run', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let base: string;
  let clonesDir: string;
  let ctxDir: string;
  let llmOpts: MockLLMOptions;
  let llm: ScriptedLLM;
  let app: Awaited<ReturnType<typeof makeApp>>;
  let seq = 0;

  const makeLlm = () => {
    llmOpts = { structured: REVIEW_FIXTURE };
    llm = new ScriptedLLM('openai', llmOpts);
    return llm;
  };

  function makeApp(env: Record<string, string> = {}) {
    return buildApp({
      config: loadConfig({
        ...process.env,
        NODE_ENV: 'test',
        DEVDIGEST_CONTEXT_DIR: ctxDir,
        ...env,
      } as NodeJS.ProcessEnv),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new TmpGit(clonesDir),
        secrets: new MockSecretsProvider({}),
        llm: {
          openai: llm,
          openrouter: new MockLLMProvider('openai', {
            structuredBySchema: { IntentClassification: INTENT_FIXTURE },
          }),
        },
      },
    });
  }

  beforeAll(async () => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-run-'));
    clonesDir = join(base, 'clones');
    ctxDir = join(base, 'ctx');
    mkdirSync(clonesDir, { recursive: true });
    mkdirSync(ctxDir, { recursive: true });
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
    makeLlm();
    app = await makeApp();
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
    rmSync(base, { recursive: true, force: true });
  });
  beforeEach(() => {
    llm.calls.length = 0;
    llm.beforeReview = undefined;
    llm.failWith = undefined;
    llmOpts.structured = REVIEW_FIXTURE;
  });

  // ── helpers ──────────────────────────────────────────────────────────────

  interface Fixture {
    repo: typeof t.repos.$inferSelect;
    pr: typeof t.pullRequests.$inferSelect;
    /** Write a file into this repo's working copy. */
    put: (rel: string, content: string) => void;
    /** Write a local-document file directly (as if it pre-dated the repo document). */
    putLocal: (rel: string, content: string) => void;
    remove: (rel: string) => void;
  }

  async function setup(): Promise<Fixture> {
    const name = `ctx-run-${seq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add rate limiting',
        author: 'marisa.koch',
        branch: 'feat/rl',
        base: 'main',
        headSha: 'a1b2c3d4',
        status: 'needs_review',
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
    const writeUnder = (root: string) => (rel: string, content: string) => {
      const abs = join(root, rel);
      mkdirSync(dirname(abs), { recursive: true });
      writeFileSync(abs, content);
    };
    const cloneRoot = join(clonesDir, 'acme', name);
    mkdirSync(cloneRoot, { recursive: true });
    return {
      repo: repo!,
      pr: pr!,
      put: writeUnder(cloneRoot),
      putLocal: writeUnder(join(ctxDir, repo!.id)),
      remove: (rel) => rmSync(join(cloneRoot, rel), { force: true }),
    };
  }

  async function makeAgent(name = `ctx-agent-${seq++}`) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name,
        provider: 'openai',
        model: 'gpt-4.1',
        system_prompt: 'You are a reviewer.',
        repo_intel: false,
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function makeSkill(name = `ctx-skill-${seq++}`) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'When X, do Y.', type: 'rubric', body: 'Skill guidance.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  async function attachAgent(agentId: string, paths: string[], a = app) {
    const res = await a.inject({ method: 'PUT', url: `/agents/${agentId}/context-docs`, payload: { paths } });
    expect(res.statusCode).toBe(200);
  }
  async function attachSkill(skillId: string, paths: string[]) {
    const res = await app.inject({ method: 'PUT', url: `/skills/${skillId}/context-docs`, payload: { paths } });
    expect(res.statusCode).toBe(200);
  }
  async function linkSkills(agentId: string, skillIds: string[]) {
    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/skills`, payload: { skill_ids: skillIds } });
    expect(res.statusCode).toBe(200);
  }

  /** Start a run and wait for its persisted trace (the run turns `done` before the trace exists). */
  async function run(prId: string, agentId: string, a = app) {
    const body = (await a.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } })).json();
    const runId = body.runs[0].run_id as string;
    // Wait for THIS run (a PR can carry several runs), then for its trace.
    let status: string | null = null;
    for (let i = 0; i < 400; i++) {
      const [row] = await pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runId));
      if (row && ['done', 'failed', 'cancelled'].includes(row.status ?? '')) {
        status = row.status;
        break;
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    for (let i = 0; i < 200; i++) {
      const res = await a.inject({ url: `/runs/${runId}/trace` });
      if (res.statusCode === 200 && Array.isArray(res.json()?.specs_read)) {
        return { runId, status, trace: res.json() as RunTrace };
      }
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`trace for run ${runId} was never persisted`);
  }

  const logOf = (trace: RunTrace) => trace.log.map((l) => l.msg);

  // ── tests ────────────────────────────────────────────────────────────────

  it('injects the agent documents, then the skills documents, in order, deduplicated — and records them in the trace (AC-27, 37, 38, 39)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'AAA-rule: no secrets in config.');
    fx.put('docs/b.md', 'BBB-rule: rate limits are mandatory.');
    fx.put('specs/c.md', 'CCC-rule: keep handlers thin.');
    const agent = await makeAgent();
    const skill = await makeSkill();
    await attachAgent(agent.id, ['docs/a.md', 'docs/b.md']);
    await attachSkill(skill.id, ['docs/b.md', 'specs/c.md']);
    await linkSkills(agent.id, [skill.id]);

    const { trace } = await run(fx.pr.id, agent.id);

    expect(trace.specs_read).toEqual(['docs/a.md', 'docs/b.md', 'specs/c.md']);
    const user = trace.prompt_assembly.user;
    expect(user).toContain('## Project context');
    const at = (p: string) => user.indexOf(`<untrusted source="${p}">`);
    expect(at('docs/a.md')).toBeGreaterThan(-1);
    expect(at('docs/a.md')).toBeLessThan(at('docs/b.md'));
    expect(at('docs/b.md')).toBeLessThan(at('specs/c.md'));
    // a document shared by the agent and its skill appears once
    expect(user.split('BBB-rule').length - 1).toBe(1);
    // the model received exactly this text
    expect(llm.userMessage()).toBe(user);

    // AC-38 — per-document detail and totals
    expect(trace.context?.docs.map((x) => [x.path, x.source])).toEqual([
      ['docs/a.md', 'repo'],
      ['docs/b.md', 'repo'],
      ['specs/c.md', 'repo'],
    ]);
    expect(trace.context?.docs.every((x) => x.tokens > 0)).toBe(true);
    expect(trace.context?.tokens).toBe(trace.context!.docs.reduce((n, x) => n + x.tokens, 0));
    expect(trace.context?.skipped).toEqual([]);

    // AC-39 — one line per document plus a total
    const log = logOf(trace);
    expect(log).toContain(`Context 1: docs/a.md (~${trace.context!.docs[0]!.tokens} tokens)`);
    expect(log.filter((m) => m.startsWith('Context ') && /^Context \d+:/.test(m))).toHaveLength(3);
    expect(log).toContain(`Context: 3 document(s) attached (~${trace.context!.tokens} tokens)`);
  });

  it('a disabled skill contributes no documents (AC-36)', async () => {
    const fx = await setup();
    fx.put('docs/own.md', 'OWN-rule');
    fx.put('docs/skill.md', 'SKILL-ONLY-rule');
    const agent = await makeAgent();
    const skill = await makeSkill();
    await attachAgent(agent.id, ['docs/own.md']);
    await attachSkill(skill.id, ['docs/skill.md']);
    await linkSkills(agent.id, [skill.id]);

    const enabled = await run(fx.pr.id, agent.id);
    expect(enabled.trace.specs_read).toEqual(['docs/own.md', 'docs/skill.md']);

    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });
    const second = await run(fx.pr.id, agent.id);
    expect(second.trace.specs_read).toEqual(['docs/own.md']);
    expect(second.trace.prompt_assembly.user).not.toContain('SKILL-ONLY-rule');
  });

  it('one model call with or without documents; without documents the messages equal the baseline and specs_read is empty (AC-31, 32)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'AAA-rule');
    const agent = await makeAgent();

    const baseline = await run(fx.pr.id, agent.id);
    const baselineMessages = llm.reviewCalls[0]!.req as { messages: unknown };
    expect(llm.reviewCalls).toHaveLength(1);
    expect(baseline.trace.specs_read).toEqual([]);
    expect(baseline.trace.prompt_assembly.user).not.toContain('Project context');
    expect(baseline.trace.context ?? null).toBeNull();

    llm.calls.length = 0;
    await attachAgent(agent.id, ['docs/a.md']);
    const withDocs = await run(fx.pr.id, agent.id);
    expect(withDocs.trace.specs_read).toEqual(['docs/a.md']);
    expect(llm.reviewCalls).toHaveLength(1);
    expect((llm.reviewCalls[0]!.req as { messages: unknown }).messages).not.toEqual(baselineMessages.messages);

    // detaching again restores the baseline prompt exactly
    llm.calls.length = 0;
    await attachAgent(agent.id, []);
    const back = await run(fx.pr.id, agent.id);
    expect(back.trace.specs_read).toEqual([]);
    expect((llm.reviewCalls[0]!.req as { messages: unknown }).messages).toEqual(baselineMessages.messages);
  });

  it('a deleted attached file is skipped with a `not_found` log line and the run completes with the rest (AC-33)', async () => {
    const fx = await setup();
    fx.put('docs/keep.md', 'KEEP-rule');
    fx.put('docs/gone.md', 'GONE-rule');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/gone.md', 'docs/keep.md']);
    fx.remove('docs/gone.md');

    const { trace, status } = await run(fx.pr.id, agent.id);

    expect(status).toBe('done');
    expect(trace.specs_read).toEqual(['docs/keep.md']);
    expect(logOf(trace)).toContain('Context skipped: docs/gone.md — not_found');
    expect(trace.context?.skipped).toEqual([{ path: 'docs/gone.md', reason: 'not_found' }]);
  });

  it('a document that would push the block over 8,000 tokens is skipped whole and later documents are still tried (AC-34)', async () => {
    const fx = await setup();
    fx.put('docs/first.md', 'FIRST-rule');
    // ~30,000 one-letter tokens, still under the 64 KiB per-document cap
    fx.put('docs/huge.md', 'a '.repeat(30_000));
    fx.put('docs/last.md', 'LAST-rule');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/first.md', 'docs/huge.md', 'docs/last.md']);

    const { trace } = await run(fx.pr.id, agent.id);

    expect(trace.specs_read).toEqual(['docs/first.md', 'docs/last.md']);
    expect(trace.context?.skipped).toEqual([{ path: 'docs/huge.md', reason: 'over_budget' }]);
    expect(logOf(trace)).toContain('Context skipped: docs/huge.md — over_budget');
    expect(trace.context!.tokens).toBeLessThanOrEqual(8_000);
  });

  it('documents are read once up front: attachment and file edits made during the model call do not change the run (AC-35)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'BEFORE-edit text');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/a.md']);
    llm.beforeReview = async () => {
      fx.put('docs/a.md', 'AFTER-edit text');
      await attachAgent(agent.id, []);
    };

    const { trace } = await run(fx.pr.id, agent.id);

    expect(trace.specs_read).toEqual(['docs/a.md']);
    expect(trace.prompt_assembly.user).toContain('BEFORE-edit text');
    expect(trace.prompt_assembly.user).not.toContain('AFTER-edit text');
    expect(llm.userMessage()).toContain('BEFORE-edit text');
  });

  it('a run reads the working-copy text at the time it starts, including edits made by the PR checkout (AC-43, 64)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'VERSION-ONE');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/a.md']);
    expect((await run(fx.pr.id, agent.id)).trace.prompt_assembly.user).toContain('VERSION-ONE');

    fx.put('docs/a.md', 'VERSION-TWO');
    const second = await run(fx.pr.id, agent.id);
    expect(second.trace.prompt_assembly.user).toContain('VERSION-TWO');
    expect(second.trace.prompt_assembly.user).not.toContain('VERSION-ONE');
  });

  it('a local document edited through the API is read at its last saved text; it is recorded as local (AC-61, 64)', async () => {
    const fx = await setup();
    const agent = await makeAgent();
    const put = async (content: string, baseVersion?: string) =>
      app.inject({
        method: 'PUT',
        url: `/repos/${fx.repo.id}/context-docs/local`,
        payload: { folder: 'docs', name: 'mine.md', content, ...(baseVersion ? { base_version: baseVersion } : {}) },
      });
    const created = await put('LOCAL-v1');
    expect(created.statusCode).toBe(200);
    await attachAgent(agent.id, ['docs/mine.md']);

    const first = await run(fx.pr.id, agent.id);
    expect(first.trace.prompt_assembly.user).toContain('LOCAL-v1');
    expect(first.trace.context?.docs).toEqual([
      expect.objectContaining({ path: 'docs/mine.md', source: 'local' }),
    ]);

    expect((await put('LOCAL-v2', created.json().version)).statusCode).toBe(200);
    const second = await run(fx.pr.id, agent.id);
    expect(second.trace.prompt_assembly.user).toContain('LOCAL-v2');
    expect(second.trace.prompt_assembly.user).not.toContain('LOCAL-v1');
  });

  it('the repository document wins over a local document at the same path (AC-65)', async () => {
    const fx = await setup();
    fx.put('docs/x.md', 'REPO-text');
    fx.putLocal('docs/x.md', 'LOCAL-text');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/x.md']);

    const { trace } = await run(fx.pr.id, agent.id);

    expect(trace.prompt_assembly.user).toContain('REPO-text');
    expect(trace.prompt_assembly.user).not.toContain('LOCAL-text');
    expect(trace.context?.docs[0]).toMatchObject({ path: 'docs/x.md', source: 'repo' });
  });

  it('a path attached while looking at repo A is resolved against the repo of the PR being reviewed (AC-9)', async () => {
    const repoA = await setup();
    const repoB = await setup();
    repoA.put('docs/x.md', 'ALPHA-text');
    repoB.put('docs/x.md', 'BRAVO-text');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/x.md']);

    const { trace } = await run(repoB.pr.id, agent.id);

    expect(trace.prompt_assembly.user).toContain('BRAVO-text');
    expect(trace.prompt_assembly.user).not.toContain('ALPHA-text');
  });

  it('documents are injected with the agent repo_intel toggle off and with REPO_INTEL_ENABLED=false (AC-77)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'AAA-rule');
    const agent = await makeAgent(); // repo_intel: false
    await attachAgent(agent.id, ['docs/a.md']);
    const viaDefault = await run(fx.pr.id, agent.id);
    expect(viaDefault.trace.specs_read).toEqual(['docs/a.md']);

    const off = await makeApp({ REPO_INTEL_ENABLED: 'false' });
    try {
      const viaEnv = await run(fx.pr.id, agent.id, off);
      expect(viaEnv.trace.specs_read).toEqual(['docs/a.md']);
      expect(viaEnv.trace.prompt_assembly.user).toContain('AAA-rule');
    } finally {
      await off.close();
    }
  });

  it('a model failure after the documents were read still lists them in the failed run trace (AC-78)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'AAA-rule');
    fx.put('docs/b.md', 'BBB-rule');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/a.md', 'docs/b.md']);
    llm.failWith = new Error('model exploded');

    const { trace, status } = await run(fx.pr.id, agent.id);

    expect(status).toBe('failed');
    expect(trace.specs_read).toEqual(['docs/a.md', 'docs/b.md']);
    expect(trace.context?.docs.map((x) => x.path)).toEqual(['docs/a.md', 'docs/b.md']);
  });

  it('persists cited documents on findings and drops citations of documents that were not injected, keeping the finding (AC-48, 49)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'AAA-rule');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/a.md']);
    llmOpts.structured = {
      ...REVIEW_FIXTURE,
      findings: [
        {
          id: 'f-1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key',
          file: 'src/config.ts',
          start_line: 11,
          end_line: 11,
          rationale: 'Violates docs/a.md.',
          suggestion: 'Move the key to an environment variable.',
          confidence: 0.95,
          kind: 'finding',
          cited_docs: ['docs/a.md', 'docs/never-attached.md'],
        },
      ],
    } satisfies Review;

    const { trace } = await run(fx.pr.id, agent.id);

    const reviews = (await app.inject({ url: `/pulls/${fx.pr.id}/reviews` })).json();
    expect(reviews[0].findings).toHaveLength(1);
    expect(reviews[0].findings[0].cited_docs).toEqual(['docs/a.md']);
    const rows = await pg.handle.db
      .select()
      .from(t.findings)
      .where(eq(t.findings.reviewId, reviews[0].id));
    expect(rows[0]?.citedDocs).toEqual(['docs/a.md']);
    expect(logOf(trace)).toContain('Context citation removed: docs/never-attached.md — not_injected');
  });

  it('no absolute filesystem path appears in the trace, the run log, the stored review or the prompt (AC-5)', async () => {
    const fx = await setup();
    fx.put('docs/a.md', 'AAA-rule');
    fx.put('docs/gone.md', 'x');
    const agent = await makeAgent();
    await attachAgent(agent.id, ['docs/a.md', 'docs/gone.md']);
    fx.remove('docs/gone.md');

    const { trace } = await run(fx.pr.id, agent.id);
    const reviews = (await app.inject({ url: `/pulls/${fx.pr.id}/reviews` })).json();
    const everything = JSON.stringify([trace, reviews, llm.calls.map((c) => c.req)]);

    expect(everything).not.toContain(base);
    expect(everything).not.toContain(clonesDir);
    expect(everything).not.toContain(ctxDir);
    expect(everything).not.toContain(tmpdir());
  });
});
