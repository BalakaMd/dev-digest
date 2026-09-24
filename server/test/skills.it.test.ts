import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * The skills module end to end: CRUD against Postgres, the version snapshot and
 * restore rules, import parsing, and the agent links that decide what reaches an
 * agent's prompt.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const newSkill = (name: string) => ({
    name,
    description: 'When X happens, do Y.',
    type: 'rubric' as const,
    body: '# Rule\nDo the thing.',
  });

  async function createSkill(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const res = await app.inject({ method: 'POST', url: '/skills', payload: newSkill(name) });
    expect(res.statusCode).toBe(201);
    return res.json();
  }

  it('seeds the two skills-experiment agents, disabled, with no skills linked', async () => {
    const app = await makeApp();
    const agents = (await app.inject({ url: '/agents' })).json();
    for (const name of ['Test Quality Reviewer', 'API Contract Reviewer']) {
      const agent = agents.find((a: { name: string }) => a.name === name);
      expect(agent).toMatchObject({ enabled: false, skill_count: 0 });
    }
    await app.close();
  });

  it('writes to Postgres: a created skill is a row; a row deleted in the DB is gone from the API', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, `db-roundtrip-${Date.now()}`);

    const rows = await pg.handle.sql`select name, version from skills where id = ${skill.id}`;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: skill.name, version: 1 });

    await pg.handle.sql`delete from skills where id = ${skill.id}`;
    const listed = (await app.inject({ url: '/skills' })).json();
    expect(listed.some((s: { id: string }) => s.id === skill.id)).toBe(false);
    expect((await app.inject({ url: `/skills/${skill.id}` })).statusCode).toBe(404);
    await app.close();
  });

  it('creates a skill at version 1 with a matching version snapshot', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, 'create-v1');
    expect(skill).toMatchObject({ name: 'create-v1', version: 1, enabled: true, source: 'manual' });

    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, body: '# Rule\nDo the thing.' });
    await app.close();
  });

  it('persists the imported source when the preview is confirmed', async () => {
    const app = await makeApp();
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { ...newSkill(`imported-${Date.now()}`), source: 'imported' },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().source).toBe('imported');
    await app.close();
  });

  it('bumps the version and snapshots the body when the content changes', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, 'bump-on-edit');

    const res = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# Rule\nDo the other thing.' },
    });
    expect(res.json()).toMatchObject({ version: 2, body: '# Rule\nDo the other thing.' });

    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    expect(versions[1].body).toBe('# Rule\nDo the thing.');
    await app.close();
  });

  it('does NOT bump the version when only `enabled` is toggled', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, 'toggle-only');
    const off = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { enabled: false },
    });
    expect(off.json()).toMatchObject({ enabled: false, version: 1 });
    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions).toHaveLength(1);
    await app.close();
  });

  it('restores an old body forward as a new version', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, 'restore-me');
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# Rule\nSecond draft.' },
    });

    const res = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ version: 3, body: '# Rule\nDo the thing.' });

    const versions = (await app.inject({ url: `/skills/${skill.id}/versions` })).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    expect(
      (await app.inject({ method: 'POST', url: `/skills/${skill.id}/versions/9/restore` }))
        .statusCode,
    ).toBe(404);
    await app.close();
  });

  it('404s on an unknown skill and on an unknown version', async () => {
    const app = await makeApp();
    const missing = '00000000-0000-4000-8000-000000000000';
    expect((await app.inject({ url: `/skills/${missing}` })).statusCode).toBe(404);
    const skill = await createSkill(app, 'versions-404');
    expect((await app.inject({ url: `/skills/${skill.id}/versions/99` })).statusCode).toBe(404);
    await app.close();
  });

  it('reports how many agents use a skill, and deleting it unlinks them', async () => {
    const app = await makeApp();
    const skill = await createSkill(app, 'used-by');
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `Uses ${Date.now()}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'x' },
      })
    ).json();
    await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skill.id] },
    });

    const listed = (await app.inject({ url: '/skills' })).json();
    expect(listed.find((s: { id: string }) => s.id === skill.id).agent_count).toBe(1);
    const agents = (await app.inject({ url: `/skills/${skill.id}/agents` })).json();
    expect(agents).toEqual([{ id: agent.id, name: agent.name }]);

    expect((await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode).toBe(200);
    const links = (await app.inject({ url: `/agents/${agent.id}/skills` })).json();
    expect(links).toEqual([]);
    await app.close();
  });

  it('keeps the agent list order when an agent is toggled or its skills change', async () => {
    const app = await makeApp();
    const ids = async () =>
      ((await app.inject({ url: '/agents' })).json() as Array<{ id: string }>).map((a) => a.id);
    const before = await ids();
    const [first] = before;
    const skill = await createSkill(app, `order-${Date.now()}`);

    // Each of these rewrites the agent row; none may move it in the list.
    await app.inject({ method: 'PUT', url: `/agents/${first}`, payload: { enabled: false } });
    await app.inject({ method: 'POST', url: `/agents/${first}/skills`, payload: { skill_ids: [skill.id] } });
    await app.inject({ method: 'PUT', url: `/agents/${first}`, payload: { enabled: true } });

    expect(await ids()).toEqual(before);
    await app.close();
  });

  describe('agent links', () => {
    async function makeAgent(app: Awaited<ReturnType<typeof makeApp>>) {
      return (
        await app.inject({
          method: 'POST',
          url: '/agents',
          payload: {
            name: `Linker ${Date.now()}-${Math.random()}`,
            provider: 'openai',
            model: 'gpt-4.1',
            system_prompt: 'x',
          },
        })
      ).json();
    }

    it('reorders by resending the set, and the order is what comes back', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const ids = [
        (await createSkill(app, `order-a-${Date.now()}`)).id,
        (await createSkill(app, `order-b-${Date.now()}`)).id,
        (await createSkill(app, `order-c-${Date.now()}`)).id,
      ];
      for (const order of [ids, [...ids].reverse()]) {
        await app.inject({
          method: 'POST',
          url: `/agents/${agent.id}/skills`,
          payload: { skill_ids: order },
        });
        const links = (await app.inject({ url: `/agents/${agent.id}/skills` })).json();
        expect(links.map((l: { id: string }) => l.id)).toEqual(order);
        expect(links.map((l: { order: number }) => l.order)).toEqual([0, 1, 2]);
      }
      const listed = (await app.inject({ url: '/agents' })).json();
      expect(listed.find((a: { id: string }) => a.id === agent.id).skill_count).toBe(3);
      await app.close();
    });

    it('bumps the agent version on a link change and snapshots the linked ids', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const a = await createSkill(app, `snap-a-${Date.now()}`);
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [a.id] },
      });
      const after = (await app.inject({ url: `/agents/${agent.id}` })).json();
      expect(after.version).toBe(agent.version + 1);
      const version = (
        await app.inject({ url: `/agents/${agent.id}/versions/${after.version}` })
      ).json();
      expect(version.config.skills).toEqual([a.id]);
      await app.close();
    });

    it('rejects unknown or duplicated skill ids without touching the links', async () => {
      const app = await makeApp();
      const agent = await makeAgent(app);
      const a = await createSkill(app, `valid-${Date.now()}`);
      await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [a.id] },
      });

      const unknown = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [a.id, '00000000-0000-4000-8000-000000000000'] },
      });
      expect(unknown.statusCode).toBe(422);
      const dup = await app.inject({
        method: 'POST',
        url: `/agents/${agent.id}/skills`,
        payload: { skill_ids: [a.id, a.id] },
      });
      expect(dup.statusCode).toBe(422);

      const links = (await app.inject({ url: `/agents/${agent.id}/skills` })).json();
      expect(links.map((l: { id: string }) => l.id)).toEqual([a.id]);
      await app.close();
    });
  });

  describe('import', () => {
    const b64 = (text: string) => Buffer.from(text, 'utf8').toString('base64');

    it('parses a markdown upload into a preview without persisting anything', async () => {
      const app = await makeApp();
      const before = (await app.inject({ url: '/skills' })).json().length;

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: {
          filename: 'imported-rule.md',
          content_b64: b64('---\ntype: security\n---\n# Imported rule\n\nFlag hardcoded secrets.'),
        },
      });

      expect(res.json()).toMatchObject({
        name: 'Imported rule',
        description: 'Flag hardcoded secrets.',
        type: 'security',
        source: 'imported',
        ignored_entries: [],
      });
      // Preview only: the library is unchanged until the user confirms.
      expect((await app.inject({ url: '/skills' })).json()).toHaveLength(before);
      await app.close();
    });

    it('takes the markdown out of an archive and lists everything else as ignored', async () => {
      const app = await makeApp();
      const archive = zipSync({
        'SKILL.md': strToU8('# Archived skill\n\nThe body.'),
        'scripts/install.sh': strToU8('#!/bin/sh\necho pwned'),
        'assets/logo.png': strToU8('not really a png'),
      });

      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: {
          filename: 'bundle.zip',
          content_b64: Buffer.from(archive).toString('base64'),
        },
      });

      const preview = res.json();
      expect(preview.name).toBe('Archived skill');
      expect(preview.body).toContain('The body.');
      // The script is reported, never read into the skill and never run.
      expect(preview.ignored_entries).toEqual(['assets/logo.png', 'scripts/install.sh']);
      expect(preview.body).not.toContain('pwned');
      expect(preview.warnings[0]).toContain('install.sh');
      await app.close();
    });

    it('422s an archive with no markdown in it', async () => {
      const app = await makeApp();
      const archive = zipSync({ 'run.sh': strToU8('#!/bin/sh') });
      const res = await app.inject({
        method: 'POST',
        url: '/skills/import',
        payload: {
          filename: 'no-md.zip',
          content_b64: Buffer.from(archive).toString('base64'),
        },
      });
      expect(res.statusCode).toBe(422);
      await app.close();
    });
  });
});
