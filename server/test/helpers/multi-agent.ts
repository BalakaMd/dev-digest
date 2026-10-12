import { eq } from 'drizzle-orm';
import * as t from '../../src/db/schema.js';
import type { PgFixture } from './pg.js';

/**
 * Seed helpers for the multi-agent review it-tests (SPEC-08 I2): insert a
 * `multi_agent_runs` record, its linked `agent_runs`, reviews and findings
 * DIRECTLY, so read/aggregate tests need no LLM and no executor.
 */
type Db = PgFixture['handle']['db'];

let seq = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

export async function defaultWorkspaceId(db: Db): Promise<string> {
  const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
  return ws!.id;
}

/** A second workspace (nobody's "current" one) to prove cross-workspace isolation. */
export async function seedForeignWorkspace(db: Db): Promise<string> {
  const [ws] = await db.insert(t.workspaces).values({ name: uniq('foreign') }).returning();
  return ws!.id;
}

export async function seedAgent(
  db: Db,
  workspaceId: string,
  o: { name?: string; enabled?: boolean; provider?: 'openai' | 'anthropic' | 'openrouter'; model?: string } = {},
) {
  const [row] = await db
    .insert(t.agents)
    .values({
      workspaceId,
      name: o.name ?? uniq('agent'),
      provider: o.provider ?? 'openai',
      model: o.model ?? 'gpt-4.1',
      systemPrompt: 'You are a reviewer.',
      enabled: o.enabled ?? true,
    })
    .returning();
  return row!;
}

/** A repo + PR (+ a persisted patch so the executor can rebuild a diff). */
export async function seedPullRequest(
  db: Db,
  workspaceId: string,
  o: { title?: string; number?: number; patch?: boolean } = {},
) {
  const name = uniq('repo');
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: o.number ?? 482,
      title: o.title ?? 'Add rate limiting',
      author: 'dev',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting.',
    })
    .returning();
  if (o.patch !== false) {
    await db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/config.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
    });
  }
  return { repo: repo!, pr: pr! };
}

export interface SeedFinding {
  file?: string;
  start?: number;
  end?: number;
  severity?: 'CRITICAL' | 'WARNING' | 'SUGGESTION';
  title?: string;
}

export interface SeedAgentRun {
  agentId: string | null;
  status?: 'running' | 'done' | 'failed' | 'cancelled';
  error?: string | null;
  /** Offset (ms) from the multi-agent record's `ranAt` at which the run ended; omit while running. */
  endedAfterMs?: number | null;
  durationMs?: number | null;
  costUsd?: number | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  /** Persist a review (+ findings) for this run. */
  review?: { summary?: string; score?: number; findings?: SeedFinding[] };
}

export interface SeededRun {
  runId: string;
  agentId: string | null;
  reviewId: string | null;
  findingIds: string[];
}

/**
 * One multi-agent record on `prId` with one linked `agent_runs` row per entry of
 * `runs`. Returns the record id and, per run, the ids of what was inserted.
 */
export async function seedMultiAgentRun(
  db: Db,
  o: {
    workspaceId: string;
    prId: string;
    ranAt?: Date;
    estimate?: typeof t.multiAgentRuns.$inferInsert.estimate;
    runs: SeedAgentRun[];
  },
): Promise<{ id: string; ranAt: Date; runs: SeededRun[] }> {
  const ranAt = o.ranAt ?? new Date();
  const [record] = await db
    .insert(t.multiAgentRuns)
    .values({ workspaceId: o.workspaceId, prId: o.prId, ranAt, estimate: o.estimate ?? null })
    .returning();

  const runs: SeededRun[] = [];
  for (const r of o.runs) {
    const status = r.status ?? 'done';
    const [run] = await db
      .insert(t.agentRuns)
      .values({
        workspaceId: o.workspaceId,
        agentId: r.agentId,
        prId: o.prId,
        ranAt,
        provider: 'openai',
        model: 'gpt-4.1',
        status,
        error: r.error ?? null,
        durationMs: r.durationMs === undefined ? (status === 'running' ? null : 1000) : r.durationMs,
        costUsd: r.costUsd ?? null,
        tokensIn: r.tokensIn ?? null,
        tokensOut: r.tokensOut ?? null,
        finishedAt:
          status === 'running' ? null : new Date(ranAt.getTime() + (r.endedAfterMs ?? r.durationMs ?? 1000)),
        multiAgentRunId: record!.id,
      })
      .returning();

    let reviewId: string | null = null;
    const findingIds: string[] = [];
    if (r.review) {
      const [review] = await db
        .insert(t.reviews)
        .values({
          workspaceId: o.workspaceId,
          prId: o.prId,
          agentId: r.agentId,
          runId: run!.id,
          kind: 'review',
          verdict: 'comment',
          summary: r.review.summary ?? 'Seeded summary.',
          score: r.review.score ?? 80,
          model: 'gpt-4.1',
        })
        .returning();
      reviewId = review!.id;
      for (const f of r.review.findings ?? []) {
        const [row] = await db
          .insert(t.findings)
          .values({
            reviewId,
            file: f.file ?? 'src/a.ts',
            startLine: f.start ?? 5,
            endLine: f.end ?? f.start ?? 5,
            severity: f.severity ?? 'WARNING',
            category: 'bug',
            title: f.title ?? 'Seeded finding',
            rationale: 'because',
            confidence: 0.9,
            kind: 'finding',
          })
          .returning();
        findingIds.push(row!.id);
      }
    }
    runs.push({ runId: run!.id, agentId: r.agentId, reviewId, findingIds });
  }
  return { id: record!.id, ranAt, runs };
}

/** Poll until `fn` yields a value accepted by `done` (default timeout 10 s). */
export async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, timeoutMs = 10_000): Promise<T> {
  const start = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - start > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((r) => setTimeout(r, 25));
  }
}
