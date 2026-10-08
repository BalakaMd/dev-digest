import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from '../helpers/pg.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { seed } from '../../src/db/seed.js';
import * as t from '../../src/db/schema.js';
import { MockGitClient, MockGitHubClient } from '../../src/adapters/mocks.js';
import { AgentsRepository } from '../../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[agents-restore] Docker not available — skipping integration tests.');
}

/**
 * SPEC-06 AC-59 / AC-70 (T-5): `POST /agents/:id/versions/:version/restore`
 * (Promote) — every snapshot field and the skill order come back as exactly ONE
 * new version; name/enabled stay; a deleted skill is skipped and reported; the
 * current version is a 409. Plus `ensureVersionSnapshot` for seeded agents.
 */
d('POST /agents/:id/versions/:version/restore', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    workspaceId = ws!.id;
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

  async function makeSkill(name: string): Promise<string> {
    const [row] = await pg.handle.db
      .insert(t.skills)
      .values({ workspaceId, name, description: name, type: 'custom', source: 'manual', body: `body ${name}` })
      .returning();
    return row!.id;
  }

  type App = Awaited<ReturnType<typeof makeApp>>;

  /** v1 plain → v2 skills [s1,s2] → v3 edited config + renamed + disabled → v4 skills [s2,s1]. */
  async function history(app: App) {
    const [s1, s2] = [await makeSkill(`s1-${Math.random()}`), await makeSkill(`s2-${Math.random()}`)];
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: {
        name: 'Promote me',
        provider: 'openai',
        model: 'gpt-4o-mini',
        system_prompt: 'ORIGINAL prompt',
        strategy: 'single-pass',
        ci_fail_on: 'critical',
        repo_intel: true,
      },
    });
    const id = created.json().id as string;
    await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_ids: [s1, s2] } });
    await app.inject({
      method: 'PUT',
      url: `/agents/${id}`,
      payload: {
        name: 'Renamed',
        model: 'gpt-4o',
        system_prompt: 'CHANGED prompt',
        strategy: 'map-reduce',
        ci_fail_on: 'any',
        repo_intel: false,
        enabled: false,
      },
    });
    await app.inject({ method: 'POST', url: `/agents/${id}/skills`, payload: { skill_ids: [s2, s1] } });
    return { id, s1, s2 };
  }

  const versionsOf = async (app: App, id: string) =>
    (await app.inject({ method: 'GET', url: `/agents/${id}/versions` })).json() as Array<{
      version: number;
      config: Record<string, unknown>;
    }>;

  it('restores all snapshot fields and the skill order as exactly one new version', async () => {
    const app = await makeApp();
    const { id, s1, s2 } = await history(app);
    const before = await versionsOf(app, id);
    expect(before.map((v) => v.version)).toEqual([4, 3, 2, 1]);
    const v2 = before.find((v) => v.version === 2)!;
    expect(v2.config.skills).toEqual([s1, s2]);

    const res = await app.inject({ method: 'POST', url: `/agents/${id}/versions/2/restore` });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body).toMatchObject({
      id,
      version: 5, // exactly one bump, not one per skill/context change
      model: 'gpt-4o-mini',
      system_prompt: 'ORIGINAL prompt',
      strategy: 'single-pass',
      ci_fail_on: 'critical',
      repo_intel: true,
      name: 'Renamed', // not part of a snapshot
      enabled: false, // not part of a snapshot
      skipped_skill_ids: [],
    });

    const after = await versionsOf(app, id);
    expect(after.map((v) => v.version)).toEqual([5, 4, 3, 2, 1]);
    expect(after[0]!.config).toEqual(v2.config); // new snapshot == restored config, skills included

    const links = (await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json() as Array<{ id: string }>;
    expect(links.map((l) => l.id)).toEqual([s1, s2]);
    await app.close();
  });

  it('409 when the requested version is already current; nothing changes', async () => {
    const app = await makeApp();
    const { id } = await history(app);
    const res = await app.inject({ method: 'POST', url: `/agents/${id}/versions/4/restore` });
    expect(res.statusCode).toBe(409);
    expect((await versionsOf(app, id)).map((v) => v.version)).toEqual([4, 3, 2, 1]);
    await app.close();
  });

  it('404 for an unknown agent and an unknown version; 422 for a bad :version', async () => {
    const app = await makeApp();
    const { id } = await history(app);
    const ghost = '00000000-0000-0000-0000-000000000000';
    expect((await app.inject({ method: 'POST', url: `/agents/${ghost}/versions/1/restore` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${id}/versions/99/restore` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/agents/${id}/versions/abc/restore` })).statusCode).toBe(422);
    await app.close();
  });

  it('a skill deleted since the snapshot is skipped and reported; the rest keep their order', async () => {
    const app = await makeApp();
    const { id, s1, s2 } = await history(app);
    await pg.handle.db.delete(t.skills).where(eq(t.skills.id, s1));

    const res = await app.inject({ method: 'POST', url: `/agents/${id}/versions/2/restore` });
    expect(res.statusCode).toBe(200);
    expect(res.json().skipped_skill_ids).toEqual([s1]);
    const links = (await app.inject({ method: 'GET', url: `/agents/${id}/skills` })).json() as Array<{ id: string }>;
    expect(links.map((l) => l.id)).toEqual([s2]);
    const newest = (await versionsOf(app, id))[0]!;
    expect(newest.version).toBe(5);
    expect(newest.config.skills).toEqual([s2]); // snapshot reflects what was really restored
    await app.close();
  });

  it('is workspace-scoped: another workspace cannot restore the agent', async () => {
    const app = await makeApp();
    const { id } = await history(app);
    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: `other-${Math.random()}` }).returning();
    const res = await new AgentsRepository(pg.handle.db).restoreVersion(otherWs!.id, id, 2);
    expect(res.kind).toBe('agent_not_found');
    await app.close();
  });

  it('ensureVersionSnapshot records the current version of an agent that has none (idempotent)', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    // Seeded agents are inserted into `agents` only — no agent_versions row.
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: 'No snapshot', provider: 'openai', model: 'gpt-4o-mini', systemPrompt: 'p', version: 1 })
      .returning();
    expect(await repo.getVersion(row!.id, 1)).toBeUndefined();

    await repo.ensureVersionSnapshot(row!);
    await repo.ensureVersionSnapshot(row!);
    const snap = await repo.getVersion(row!.id, 1);
    expect(snap?.configJson).toMatchObject({ model: 'gpt-4o-mini', system_prompt: 'p', skills: [] });
  });

  it('restoring from a seeded agent also back-fills the snapshot of the replaced version', async () => {
    const repo = new AgentsRepository(pg.handle.db);
    const [row] = await pg.handle.db
      .insert(t.agents)
      .values({ workspaceId, name: 'Seeded-like', provider: 'openai', model: 'm1', systemPrompt: 'one', version: 1 })
      .returning();
    await repo.ensureVersionSnapshot(row!);
    // Move the agent to v2 behind the snapshot's back (as an edit without snapshot would).
    await pg.handle.db.update(t.agents).set({ model: 'm2', version: 2 }).where(eq(t.agents.id, row!.id));
    const res = await repo.restoreVersion(workspaceId, row!.id, 1);
    expect(res.kind).toBe('restored');
    expect((await repo.getVersion(row!.id, 2))?.configJson).toMatchObject({ model: 'm2' });
    expect((await repo.getVersion(row!.id, 3))?.configJson).toMatchObject({ model: 'm1' });
  });
});
