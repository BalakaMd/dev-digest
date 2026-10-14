import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import {
  defaultWorkspaceId,
  seedAgent,
  seedForeignWorkspace,
  seedMultiAgentRun,
  seedPullRequest,
} from './helpers/multi-agent.js';
import { seed } from '../src/db/seed.js';
import { ReviewRepository } from '../src/modules/reviews/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

/**
 * SPEC-08 T-13 — the multi-agent aggregate in `ReviewRepository` (AC-19/26/15, NFR-3):
 * atomic creation, `finished_at` on every terminal transition, workspace filters and the
 * estimate sample window.
 */
d('multi-agent repository (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: ReviewRepository;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg(); // also proves migration 0016 applies on a fresh database
    await seed(pg.handle.db);
    repo = new ReviewRepository(pg.handle.db);
    workspaceId = await defaultWorkspaceId(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  const target = (a: { id: string; provider: string; model: string }) => ({ agentId: a.id, provider: a.provider, model: a.model });

  it('AC-19: creates the record and one linked running run per target, in target order', async () => {
    const db = pg.handle.db;
    const { pr } = await seedPullRequest(db, workspaceId);
    const [a, b] = [await seedAgent(db, workspaceId), await seedAgent(db, workspaceId)];
    const estimate = { time_ms: 1, cost_usd: 0.5, agents_without_time: 0, agents_without_cost: 0 };

    const created = await repo.createMultiAgentRun({ workspaceId, prId: pr.id, estimate, targets: [target(a), target(b)] });

    expect(created.runIds).toHaveLength(2);
    const [record] = await db.select().from(t.multiAgentRuns).where(eq(t.multiAgentRuns.id, created.id));
    expect(record).toMatchObject({ workspaceId, prId: pr.id, estimate });
    const runs = await db.select().from(t.agentRuns).where(eq(t.agentRuns.multiAgentRunId, created.id));
    expect(runs.map((r) => r.id).sort()).toEqual([...created.runIds].sort());
    expect(runs.every((r) => r.status === 'running' && r.prId === pr.id && r.finishedAt === null)).toBe(true);
    const byRun = new Map(runs.map((r) => [r.id, r.agentId]));
    expect(created.runIds.map((id) => byRun.get(id))).toEqual([a.id, b.id]);
  });

  it('AC-19: creation is atomic — a failing second run rolls back the record and the first run', async () => {
    const db = pg.handle.db;
    const { pr } = await seedPullRequest(db, workspaceId);
    const a = await seedAgent(db, workspaceId);
    const before = (await db.select().from(t.multiAgentRuns)).length;

    await expect(
      repo.createMultiAgentRun({
        workspaceId,
        prId: pr.id,
        estimate: null,
        targets: [target(a), { agentId: '00000000-0000-4000-8000-000000000000', provider: 'openai', model: 'm' }], // FK violation
      }),
    ).rejects.toThrow();

    expect(await db.select().from(t.agentRuns).where(eq(t.agentRuns.prId, pr.id))).toEqual([]);
    expect((await db.select().from(t.multiAgentRuns)).length).toBe(before);
  });

  it('AC-26: finished_at is set when a run completes, is cancelled, or is reaped — and a finished run is left alone', async () => {
    const db = pg.handle.db;
    const { pr } = await seedPullRequest(db, workspaceId);
    const [a, b, c] = [await seedAgent(db, workspaceId), await seedAgent(db, workspaceId), await seedAgent(db, workspaceId)];
    const { runIds } = await repo.createMultiAgentRun({ workspaceId, prId: pr.id, estimate: null, targets: [a, b, c].map(target) });
    const finishedAt = async (id: string) => (await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, id)))[0]!.finishedAt;

    expect(await finishedAt(runIds[0]!)).toBeNull();
    await repo.completeAgentRun(runIds[0]!, { status: 'done', durationMs: 5, tokensIn: 1, tokensOut: 1, findingsCount: 0, grounding: '0/0 passed' });
    expect(await repo.cancelRunIfRunning(runIds[1]!)).toBe(true);
    expect(await finishedAt(runIds[0]!)).toBeInstanceOf(Date);
    expect(await finishedAt(runIds[1]!)).toBeInstanceOf(Date);

    // cancelling an already finished run changes nothing
    const doneAt = await finishedAt(runIds[0]!);
    expect(await repo.cancelRunIfRunning(runIds[0]!)).toBe(false);
    expect(await finishedAt(runIds[0]!)).toEqual(doneAt);

    // the last one is still running -> reaped on boot as failed, with a finish time
    expect(await finishedAt(runIds[2]!)).toBeNull();
    expect(await repo.reapStaleRunningRuns()).toBeGreaterThanOrEqual(1);
    const [reaped] = await db.select().from(t.agentRuns).where(eq(t.agentRuns.id, runIds[2]!));
    expect(reaped).toMatchObject({ status: 'failed' });
    expect(reaped!.finishedAt).toBeInstanceOf(Date);
  });

  it('NFR-3: every read filters by workspace — a foreign workspace sees nothing of the batch', async () => {
    const db = pg.handle.db;
    const { pr } = await seedPullRequest(db, workspaceId);
    const agent = await seedAgent(db, workspaceId);
    const seeded = await seedMultiAgentRun(db, {
      workspaceId,
      prId: pr.id,
      runs: [{ agentId: agent.id, costUsd: 0.1, review: { findings: [{}] } }],
    });
    const foreignWs = await seedForeignWorkspace(db);

    expect(await repo.getMultiAgentRun(workspaceId, seeded.id)).toMatchObject({ id: seeded.id, prId: pr.id, prNumber: 482 });
    expect(await repo.getMultiAgentRun(foreignWs, seeded.id)).toBeUndefined();
    expect(await repo.listMultiAgentEntries(foreignWs, seeded.id)).toEqual([]);
    expect(await repo.latestMultiAgentRunForPull(foreignWs, pr.id)).toBeUndefined();
    expect(await repo.estimateSamples(foreignWs, [agent.id])).toEqual([{ agentId: agent.id, durations: [], costs: [] }]);

    // and in the right workspace the same calls do return the data
    const entries = await repo.listMultiAgentEntries(workspaceId, seeded.id);
    expect(entries).toHaveLength(1);
    expect(entries[0]!.findings).toHaveLength(1);
    expect((await repo.latestMultiAgentRunForPull(workspaceId, pr.id))!.id).toBe(seeded.id);
    expect((await repo.estimateSamples(workspaceId, [agent.id]))[0]!.costs).toEqual([0.1]);
  });

  it('AC-15: estimate samples take the newest 10 done runs that HAVE the value, newest first, per metric', async () => {
    const db = pg.handle.db;
    const agent = await seedAgent(db, workspaceId);
    const base = new Date('2026-09-01T00:00:00Z').getTime();
    await db.insert(t.agentRuns).values([
      // 12 done runs; run i started i minutes after base; the two newest have no cost
      ...Array.from({ length: 12 }, (_, k) => ({
        workspaceId,
        agentId: agent.id,
        ranAt: new Date(base + (k + 1) * 60_000),
        status: 'done',
        durationMs: (k + 1) * 1000,
        costUsd: k + 1 > 10 ? null : (k + 1) * 0.01,
      })),
      // never sampled: failed / running / cancelled
      { workspaceId, agentId: agent.id, ranAt: new Date(base + 90 * 60_000), status: 'failed', durationMs: 777, costUsd: 7 },
      { workspaceId, agentId: agent.id, ranAt: new Date(base + 91 * 60_000), status: 'running' },
      { workspaceId, agentId: agent.id, ranAt: new Date(base + 92 * 60_000), status: 'cancelled', durationMs: 888, costUsd: 8 },
    ]);

    const [samples] = await repo.estimateSamples(workspaceId, [agent.id]);
    expect(samples!.durations).toEqual([12000, 11000, 10000, 9000, 8000, 7000, 6000, 5000, 4000, 3000]);
    expect(samples!.costs.map((c) => Math.round(c * 100))).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });

  it('AC-26: entries list findings in the total order (file, start_line, end_line, id), whatever the insert order', async () => {
    const db = pg.handle.db;
    const { pr } = await seedPullRequest(db, workspaceId);
    const agent = await seedAgent(db, workspaceId);
    const seeded = await seedMultiAgentRun(db, {
      workspaceId,
      prId: pr.id,
      runs: [
        {
          agentId: agent.id,
          review: {
            findings: [
              { file: 'src/b.ts', start: 1, title: 'b1' },
              { file: 'src/a.ts', start: 9, end: 9, title: 'a9' },
              { file: 'src/a.ts', start: 2, end: 8, title: 'a2-8' },
              { file: 'src/a.ts', start: 2, end: 3, title: 'a2-3' },
            ],
          },
        },
      ],
    });
    const [entry] = await repo.listMultiAgentEntries(workspaceId, seeded.id);
    expect(entry!.findings.map((f) => f.title)).toEqual(['a2-3', 'a2-8', 'a9', 'b1']);
  });
});
