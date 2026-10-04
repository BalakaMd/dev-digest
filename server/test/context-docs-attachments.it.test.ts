import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[context-docs-attachments.it] Docker not available — skipping integration tests.');
}

/**
 * Attaching project context documents to agents and skills over HTTP against a
 * real Postgres (SPEC-01 — AC-24, 25, 26, 75, 76).
 *
 *   PUT /agents/:id/context-docs   {paths}   → agent (version bumps when the list changes)
 *   PUT /skills/:id/context-docs   {paths}   → skill (version never bumps)
 *
 * Needs Docker; skipped without it.
 */
d('attached context documents', () => {
  let pg: PgFixture;
  let app: Awaited<ReturnType<typeof makeApp>>;
  let seq = 0;

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    app = await makeApp();
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  async function makeAgent() {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: `Attach Agent ${seq++}`,
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'Review the diff.',
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; context_docs: string[] };
  }

  async function makeSkill() {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name: `Attach Skill ${seq++}`, description: 'When X, do Y.', type: 'rubric', body: 'Guidance.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; version: number; context_docs: string[] };
  }

  const putAgent = (id: string, paths: unknown) =>
    app.inject({ method: 'PUT', url: `/agents/${id}/context-docs`, payload: { paths } });
  const putSkill = (id: string, paths: unknown) =>
    app.inject({ method: 'PUT', url: `/skills/${id}/context-docs`, payload: { paths } });
  const getAgent = async (id: string) => (await app.inject({ url: `/agents/${id}` })).json();
  const getSkill = async (id: string) => (await app.inject({ url: `/skills/${id}` })).json();

  it('a new agent and a new skill start with no attachments (AC-25)', async () => {
    const agent = await makeAgent();
    const skill = await makeSkill();
    expect(agent.context_docs).toEqual([]);
    expect(skill.context_docs).toEqual([]);
  });

  it('returns the attached paths in the saved order from GET /agents/:id, the list and GET /skills/:id (AC-25)', async () => {
    const agent = await makeAgent();
    const skill = await makeSkill();
    const paths = ['specs/b.md', 'docs/a.md', '.devdigest/specs/z.md'];

    expect((await putAgent(agent.id, paths)).statusCode).toBe(200);
    expect((await putSkill(skill.id, ['insights/i.md', 'docs/a.md'])).statusCode).toBe(200);

    expect((await getAgent(agent.id)).context_docs).toEqual(paths);
    const listed = (await app.inject({ url: '/agents' })).json() as Array<{ id: string; context_docs: string[] }>;
    expect(listed.find((a) => a.id === agent.id)?.context_docs).toEqual(paths);
    expect((await getSkill(skill.id)).context_docs).toEqual(['insights/i.md', 'docs/a.md']);

    // reordering is a change and is kept exactly
    const reordered = [...paths].reverse();
    expect((await putAgent(agent.id, reordered)).json().context_docs).toEqual(reordered);
    expect((await getAgent(agent.id)).context_docs).toEqual(reordered);
  });

  it('stores paths only in the database — never document text (AC-24)', async () => {
    const agent = await makeAgent();
    const skill = await makeSkill();
    await putAgent(agent.id, ['docs/a.md', 'specs/b.md']);
    await putSkill(skill.id, ['docs/a.md']);

    const [agentRow] = await pg.handle.db.select().from(t.agents).where(eq(t.agents.id, agent.id));
    const [skillRow] = await pg.handle.db.select().from(t.skills).where(eq(t.skills.id, skill.id));
    expect(agentRow?.contextDocs).toEqual(['docs/a.md', 'specs/b.md']);
    expect(skillRow?.contextDocs).toEqual(['docs/a.md']);
  });

  it.each([
    ['a duplicate path', ['docs/a.md', 'docs/a.md']],
    ['more than 20 paths', Array.from({ length: 21 }, (_, i) => `docs/d${i}.md`)],
    ['a parent-directory segment', ['../x.md']],
    ['a nested parent-directory segment', ['docs/../../x.md']],
    ['an absolute path', ['/etc/passwd.md']],
    ['a NUL byte', ['docs/a\u0000.md']],
    ['a backslash', ['docs\\a.md']],
    ['a non-markdown file', ['docs/a.txt']],
    ['a path outside the context folders', ['src/notes.md']],
  ])('rejects a list with %s with 422 and keeps the saved list (AC-26)', async (_label, bad) => {
    const agent = await makeAgent();
    const skill = await makeSkill();
    await putAgent(agent.id, ['docs/keep.md']);
    await putSkill(skill.id, ['docs/keep.md']);
    const before = (await getAgent(agent.id)).version;

    const a = await putAgent(agent.id, bad);
    const s = await putSkill(skill.id, bad);

    expect(a.statusCode).toBe(422);
    expect(s.statusCode).toBe(422);
    expect((await getAgent(agent.id)).context_docs).toEqual(['docs/keep.md']);
    expect((await getAgent(agent.id)).version).toBe(before);
    expect((await getSkill(skill.id)).context_docs).toEqual(['docs/keep.md']);
  });

  it('accepts exactly 20 paths (AC-26 boundary)', async () => {
    const agent = await makeAgent();
    const paths = Array.from({ length: 20 }, (_, i) => `docs/d${i}.md`);
    const res = await putAgent(agent.id, paths);
    expect(res.statusCode).toBe(200);
    expect(res.json().context_docs).toEqual(paths);
  });

  it('answers 404 for an unknown agent or skill', async () => {
    const unknown = '00000000-0000-4000-8000-000000000000';
    expect((await putAgent(unknown, ['docs/a.md'])).statusCode).toBe(404);
    expect((await putSkill(unknown, ['docs/a.md'])).statusCode).toBe(404);
  });

  it('changing an agent list bumps its version and the version snapshot holds the ordered paths; an identical list does not (AC-75)', async () => {
    const agent = await makeAgent();
    expect(agent.version).toBe(1);

    const changed = await putAgent(agent.id, ['docs/b.md', 'docs/a.md']);
    expect(changed.json().version).toBe(2);
    const v2 = (await app.inject({ url: `/agents/${agent.id}/versions/2` })).json();
    expect(v2.config.context_docs).toEqual(['docs/b.md', 'docs/a.md']);
    // the earlier snapshot is untouched
    const v1 = (await app.inject({ url: `/agents/${agent.id}/versions/1` })).json();
    expect(v1.config.context_docs ?? []).toEqual([]);

    const same = await putAgent(agent.id, ['docs/b.md', 'docs/a.md']);
    expect(same.json().version).toBe(2);
    const versions = (await app.inject({ url: `/agents/${agent.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);

    // a pure reorder is a change
    expect((await putAgent(agent.id, ['docs/a.md', 'docs/b.md'])).json().version).toBe(3);
    // and so is detaching everything
    expect((await putAgent(agent.id, [])).json().version).toBe(4);
    const v4 = (await app.inject({ url: `/agents/${agent.id}/versions/4` })).json();
    expect(v4.config.context_docs).toEqual([]);
  });

  it('changing a skill list keeps the skill version and its history unchanged (AC-76)', async () => {
    const skill = await makeSkill();
    const historyBefore = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();

    const res = await putSkill(skill.id, ['docs/a.md', 'specs/b.md']);
    expect(res.statusCode).toBe(200);
    expect(res.json().version).toBe(skill.version);
    expect((await getSkill(skill.id)).version).toBe(skill.version);
    expect((await app.inject({ url: `/skills/${skill.id}/versions` })).json()).toEqual(historyBefore);
  });
});
