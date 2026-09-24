import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { Review } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills-prompt] Docker not available — skipping integration tests.');
}

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

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

/**
 * What actually reaches the model.
 *
 * Linking a skill to an agent (in order) and the skill's own global `enabled`
 * decide what reaches the model. These tests assert on the persisted run
 * trace's `prompt_assembly` and `log`, which is the same document the trace
 * drawer renders — so a passing test here means the UI shows it too.
 */
d('skills in the assembled prompt', () => {
  let pg: PgFixture;
  let workspaceId: string;
  let prSeq = 0;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        llm: { openai: new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }) },
      },
    });
  }

  async function setupPr() {
    const name = `skills-prompt-${prSeq++}`;
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
    return pr!;
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  async function makeAgent(app: App, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name,
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'You are a reviewer.',
          // Off: repo-intel enrichment would add unrelated prompt sections.
          repo_intel: false,
        },
      })
    ).json();
  }

  async function makeSkill(app: App, name: string, body: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/skills',
        payload: { name, description: 'When X, do Y.', type: 'rubric', body },
      })
    ).json();
  }

  /** Run one agent over a PR and return the persisted trace. */
  async function traceFor(app: App, prId: string, agentId: string) {
    const body = (
      await app.inject({ method: 'POST', url: `/pulls/${prId}/review`, payload: { agentId } })
    ).json();
    await waitForPrRuns(pg.handle.db, prId, { expected: 1 });
    const runId = body.runs[0].run_id;
    // The run is marked done BEFORE its trace document is written, so a
    // terminal status alone does not mean the trace exists yet — poll for it.
    for (let i = 0; i < 200; i++) {
      const res = await app.inject({ url: `/runs/${runId}/trace` });
      if (res.statusCode === 200 && res.json()?.prompt_assembly) return res.json();
      await new Promise((r) => setTimeout(r, 25));
    }
    throw new Error(`trace for run ${runId} was never persisted`);
  }

  async function link(app: App, agentId: string, skillIds: string[]) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/skills`,
      payload: { skill_ids: skillIds },
    });
    expect(res.statusCode).toBe(200);
  }

  it('an agent with no skills produces no skills block at all', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agent = await makeAgent(app, `No Skills ${Date.now()}`);

    const trace = await traceFor(app, pr.id, agent.id);
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.prompt_assembly.skills_tokens ?? null).toBeNull();
    expect(trace.prompt_assembly.user).not.toContain('## Skills / rules');
    await app.close();
  });

  it('injects linked skills as named blocks, in link order — reordering swaps them', async () => {
    const app = await makeApp();
    const agent = await makeAgent(app, `Two Skills ${Date.now()}`);
    const first = await makeSkill(app, `alpha-${Date.now()}`, 'Alpha guidance.');
    const second = await makeSkill(app, `beta-${Date.now()}`, 'Beta guidance.');

    await link(app, agent.id, [second.id, first.id]);
    const before = (await traceFor(app, (await setupPr()).id, agent.id)).prompt_assembly;
    expect(before.skills).toContain(`### ${second.name}\nBeta guidance.`);
    expect(before.skills.indexOf(second.name)).toBeLessThan(before.skills.indexOf(first.name));
    expect(before.skill_blocks.map((b: { name: string }) => b.name)).toEqual([
      second.name,
      first.name,
    ]);

    // The drag&drop on the agent's Skills tab resends the ordered set.
    await link(app, agent.id, [first.id, second.id]);
    const after = (await traceFor(app, (await setupPr()).id, agent.id)).prompt_assembly;
    expect(after.skills.indexOf(first.name)).toBeLessThan(after.skills.indexOf(second.name));
    expect(after.skill_blocks.map((b: { name: string }) => b.name)).toEqual([
      first.name,
      second.name,
    ]);
    await app.close();
  });

  it('weighs the skills block alone, not the whole prompt', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agent = await makeAgent(app, `Weighed ${Date.now()}`);
    const skill = await makeSkill(app, `weighed-${Date.now()}`, 'Some guidance. '.repeat(20));
    await link(app, agent.id, [skill.id]);

    const { prompt_assembly: pa } = await traceFor(app, pr.id, agent.id);
    expect(pa.skills_tokens).toBeGreaterThan(0);
    expect(pa.skill_blocks).toHaveLength(1);
    expect(pa.skill_blocks[0].tokens).toBeGreaterThan(0);
    // Far less than the user message, which also carries the task and the diff.
    expect(pa.skills_tokens).toBeLessThan(Math.ceil(pa.user.length / 4));
    await app.close();
  });

  it('leaves out an unlinked skill entirely', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agent = await makeAgent(app, `Unlinked ${Date.now()}`);
    const on = await makeSkill(app, `on-${Date.now()}`, 'Included guidance.');
    await makeSkill(app, `off-${Date.now()}`, 'Excluded guidance.');
    await link(app, agent.id, [on.id]);

    const trace = await traceFor(app, pr.id, agent.id);
    expect(trace.prompt_assembly.skills).toContain('Included guidance.');
    expect(trace.prompt_assembly.skills).not.toContain('Excluded guidance.');
    await app.close();
  });

  it('leaves out a globally disabled skill even when it is linked', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agent = await makeAgent(app, `Global Off ${Date.now()}`);
    const skill = await makeSkill(app, `global-off-${Date.now()}`, 'Globally disabled guidance.');
    await link(app, agent.id, [skill.id]);
    await app.inject({ method: 'PUT', url: `/skills/${skill.id}`, payload: { enabled: false } });

    const trace = await traceFor(app, pr.id, agent.id);
    expect(trace.prompt_assembly.skills).toBeNull();
    expect(trace.log.some((l: { msg: string }) => l.msg.includes(skill.name))).toBe(false);
    await app.close();
  });

  it('logs one line per injected skill plus a total with its token weight', async () => {
    const app = await makeApp();
    const pr = await setupPr();
    const agent = await makeAgent(app, `Logged ${Date.now()}`);
    const skill = await makeSkill(app, `logged-${Date.now()}`, 'Some guidance.');
    await link(app, agent.id, [skill.id]);

    const trace = await traceFor(app, pr.id, agent.id);
    const perSkill = trace.log.filter((l: { msg: string }) => l.msg.startsWith('Skill 1:'));
    expect(perSkill).toHaveLength(1);
    expect(perSkill[0].msg).toContain(skill.name);
    const total = trace.log.find((l: { msg: string }) => l.msg.startsWith('Skills:'));
    expect(total.msg).toMatch(/1 attached \(~\d+ tokens\)/);
    await app.close();
  });
});
