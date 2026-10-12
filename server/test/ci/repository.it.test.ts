import { describe, it, expect } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { dockerAvailable } from '../helpers/pg.js';
import * as t from '../../src/db/schema.js';
import { CiRepository } from '../../src/modules/ci/repository.js';
import type { UpsertInstallationInput } from '../../src/modules/ci/types.js';
import { ciRunInput, insertAgent, insertRepo, uniq, useCiDb } from './it-env.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci repository] Docker not available — skipping integration tests.');
}

/**
 * T-22 — CiRepository against a real Postgres (AC-54, AC-56, AC-52, NFR-4 keyset order):
 * CI results are `agent_runs` rows with source='ci'; re-collection is idempotent in SQL;
 * pages follow a total order; everything is workspace-scoped.
 */
d('CiRepository (real Postgres)', () => {
  const env = useCiDb();
  const repo = () => new CiRepository(env.pg.handle.db);
  const NOW = new Date('2026-03-01T12:00:00Z');

  const installInput = (agentId: string, repoName: string, over: Partial<UpsertInstallationInput> = {}): UpsertInstallationInput => ({
    agentId,
    repo: repoName,
    agentSlug: 'reviewer',
    agentName: 'Reviewer',
    workflowPath: '.github/workflows/devdigest-review-reviewer.yml',
    status: 'pr_open',
    exportedAgentVersion: 2,
    triggers: ['opened', 'synchronize'],
    postAs: 'github_review',
    prUrl: 'https://github.com/acme/web/pull/3',
    prNumber: 3,
    now: NOW,
    ...over,
  });

  async function setupInstallation() {
    const agent = await insertAgent(env);
    const repoName = `acme/${uniq('web')}`;
    const inst = await repo().upsertInstallation(env.workspaceId, installInput(agent.id, repoName));
    return { agent, repoName, inst };
  }

  it('stores a result as one agent_runs row with source=ci, every CI column set and no PR link (AC-54)', async () => {
    const { agent, repoName, inst } = await setupInstallation();
    const trace = {
      manifest: { agent_version: 2, sha256: 'a'.repeat(64) },
      model: 'anthropic/claude-sonnet',
      runner_version: '1.0.0',
      reviewer_core_revision: 'abc',
      node_version: 'v22.0.0',
      skill_hashes: [{ slug: 'auth', sha256: 'b'.repeat(64) }],
      head_sha: 'deadbeef',
    };
    const input = ciRunInput({ agentId: agent.id, installationId: inst.id, repo: repoName, trace, blockers: 1, verdict: 'request_changes' });

    expect(await repo().insertCiRun(env.workspaceId, input)).toBe(true);

    const [row] = await env.pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.actionsRunId, input.actionsRunId));
    expect(row).toMatchObject({
      workspaceId: env.workspaceId,
      agentId: agent.id,
      prId: null,
      source: 'ci',
      status: 'done',
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      durationMs: 12_000,
      costUsd: 0.02,
      findingsCount: 2,
      blockers: 1,
      verdict: 'request_changes',
      ciInstallationId: inst.id,
      repo: repoName,
      externalPrNumber: 7,
      actionsRunAttempt: 1,
      actionsJobUrl: 'https://github.com/acme/web/actions/runs/1',
      headSha: 'deadbeef',
      ciTrace: trace,
    });

    const detail = await repo().getCiRun(env.workspaceId, row!.id);
    expect(detail).toMatchObject({ id: row!.id, verdict: 'request_changes', head_sha: 'deadbeef', model: 'anthropic/claude-sonnet', trace });
    expect(detail!.pr_url).toBe(`https://github.com/${repoName}/pull/7`);
  });

  it('keeps one row for the same (repo, run, attempt) and adds one for a new attempt (AC-56)', async () => {
    const { agent, repoName, inst } = await setupInstallation();
    const first = ciRunInput({ agentId: agent.id, installationId: inst.id, repo: repoName, actionsRunId: '4242', actionsRunAttempt: 1 });

    expect(await repo().insertCiRun(env.workspaceId, first)).toBe(true);
    expect(await repo().insertCiRun(env.workspaceId, first)).toBe(false);
    expect(await repo().ciRunExists(env.workspaceId, repoName, '4242', 1)).toBe(true);
    expect(await repo().ciRunExists(env.workspaceId, repoName, '4242', 2)).toBe(false);

    expect(await repo().insertCiRun(env.workspaceId, { ...first, actionsRunAttempt: 2 })).toBe(true);
    const rows = await env.pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(and(eq(t.agentRuns.repo, repoName), eq(t.agentRuns.source, 'ci')));
    expect(rows.map((r) => r.actionsRunAttempt).sort()).toEqual([1, 2]);
  });

  it('lists a failed run as verdict "failed" with null findings, cost and duration (AC-52)', async () => {
    const { agent, repoName, inst } = await setupInstallation();
    await repo().insertCiRun(
      env.workspaceId,
      ciRunInput({ agentId: agent.id, installationId: inst.id, repo: repoName, status: 'failed', model: null, durationMs: null, costUsd: null, findingsCount: null, blockers: null, verdict: null }),
    );
    const { items } = await repo().listCiRuns(env.workspaceId, { limit: 10, installationId: inst.id });
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ verdict: 'failed', findings_count: null, cost_usd: null, duration_ms: null, repo: repoName });
  });

  it('pages newest first by (ran_at, id) with a keyset cursor, without gaps or repeats across equal timestamps (NFR-4)', async () => {
    const { agent, repoName, inst } = await setupInstallation();
    const times = ['2026-03-01T10:00:00Z', '2026-03-01T10:00:00Z', '2026-03-01T10:00:00Z', '2026-03-01T09:00:00Z', '2026-03-01T11:00:00Z'];
    for (const [i, at] of times.entries()) {
      await repo().insertCiRun(
        env.workspaceId,
        ciRunInput({ agentId: agent.id, installationId: inst.id, repo: repoName, actionsRunId: `p-${i}`, ranAt: new Date(at) }),
      );
    }

    const seen: string[] = [];
    let after: { ranAt: Date; id: string } | undefined;
    for (let guard = 0; guard < 10; guard++) {
      const page = await repo().listCiRuns(env.workspaceId, { limit: 2, installationId: inst.id, after });
      seen.push(...page.items.map((i) => i.id));
      if (!page.next) break;
      after = page.next;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);

    const all = (await repo().listCiRuns(env.workspaceId, { limit: 50, installationId: inst.id })).items;
    expect(all.map((i) => i.id)).toEqual(seen);
    const ranAts = all.map((i) => i.ran_at);
    expect([...ranAts].sort().reverse()).toEqual(ranAts);
    // Equal timestamps are ordered by id descending.
    const tied = all.filter((i) => i.ran_at === '2026-03-01T10:00:00.000Z').map((i) => i.id);
    expect([...tied].sort().reverse()).toEqual(tied);
  });

  it('returns the latest run per installation and scopes everything to the workspace', async () => {
    const a = await setupInstallation();
    const b = await setupInstallation();
    await repo().insertCiRun(env.workspaceId, ciRunInput({ agentId: a.agent.id, installationId: a.inst.id, repo: a.repoName, actionsRunId: 'l-1', ranAt: new Date('2026-03-01T08:00:00Z') }));
    const newest = ciRunInput({ agentId: a.agent.id, installationId: a.inst.id, repo: a.repoName, actionsRunId: 'l-2', ranAt: new Date('2026-03-01T09:00:00Z') });
    await repo().insertCiRun(env.workspaceId, newest);

    const latest = await repo().latestRunByInstallation(env.workspaceId, [a.inst.id, b.inst.id]);
    expect([...latest.keys()]).toEqual([a.inst.id]);
    expect(latest.get(a.inst.id)!.ran_at).toBe('2026-03-01T09:00:00.000Z');

    // Another workspace sees none of it.
    expect((await repo().listCiRuns(env.otherWorkspaceId, { limit: 50 })).items).toEqual([]);
    expect(await repo().getInstallationById(env.otherWorkspaceId, a.inst.id)).toBeUndefined();
    expect(await repo().listInstallationsForAgent(env.otherWorkspaceId, a.agent.id)).toEqual([]);
    const [row] = await env.pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.actionsRunId, 'l-2'));
    expect(await repo().getCiRun(env.otherWorkspaceId, row!.id)).toBeUndefined();
  });

  it('upserts one installation per (agent, repo); status_changed_at moves only when the status does', async () => {
    const { agent, repoName, inst } = await setupInstallation();
    const later = new Date('2026-03-02T12:00:00Z');

    const same = await repo().upsertInstallation(env.workspaceId, installInput(agent.id, repoName, { now: later, exportedAgentVersion: 4 }));
    expect(same.id).toBe(inst.id);
    expect(same.exportedAgentVersion).toBe(4);
    expect(same.statusChangedAt.toISOString()).toBe(NOW.toISOString());

    const changed = await repo().upsertInstallation(env.workspaceId, installInput(agent.id, repoName, { now: later, status: 'awaiting_manual', prUrl: null, prNumber: null }));
    expect(changed.statusChangedAt.toISOString()).toBe(later.toISOString());
    expect(changed.installedAt.toISOString()).toBe(NOW.toISOString());
    expect(await repo().listInstallationsForAgent(env.workspaceId, agent.id)).toHaveLength(1);
  });

  it('knows which repositories the workspace imported', async () => {
    const name = `acme/${uniq('imported')}`;
    await insertRepo(env, name);
    expect(await repo().isImportedRepo(env.workspaceId, name)).toBe(true);
    expect(await repo().isImportedRepo(env.otherWorkspaceId, name)).toBe(false);
  });
});
