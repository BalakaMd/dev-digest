import { beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, type PgFixture } from './pg.js';
import { buildApp } from '../../src/app.js';
import type { ContainerOverrides } from '../../src/platform/container.js';
import { loadConfig } from '../../src/platform/config.js';
import * as t from '../../src/db/schema.js';
import { MockAuthProvider, MockGitClient, MockGitHubClient, MockSecretsProvider } from '../../src/adapters/mocks.js';

/**
 * Shared setup of the Agent Performance integration suites (SPEC-10): a real Postgres started once
 * per test file, two empty workspaces (the caller's and a foreign one), a hermetic app whose caller
 * is the first workspace, and a seed of runs / reviews / findings with hand-computed expectations.
 *
 * NOTE: `buildApp` reaps `running` agent runs on boot — build the app BEFORE seeding the fixture
 * (the fixture holds a `running` run on purpose).
 */
export interface PerfEnv {
  pg: PgFixture;
  /** The caller's workspace. */
  workspaceId: string;
  /** A second workspace whose data must never show up. */
  otherWorkspaceId: string;
}

export function usePerfDb(): PerfEnv {
  const env = {} as PerfEnv;
  beforeAll(async () => {
    env.pg = await startPg();
    const db = env.pg.handle.db;
    const [ws] = await db.insert(t.workspaces).values({ name: 'perf-caller' }).returning();
    const [other] = await db.insert(t.workspaces).values({ name: 'perf-foreign' }).returning();
    env.workspaceId = ws!.id;
    env.otherWorkspaceId = other!.id;
  });
  afterAll(async () => {
    await env.pg?.stop();
  });
  return env;
}

/** The app under test: the caller is `env.workspaceId`; git/GitHub/secrets are mocks (no network, no keys). */
export function makePerfApp(env: PerfEnv, overrides: ContainerOverrides = {}) {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  return buildApp({
    config,
    db: env.pg.handle.db,
    overrides: {
      auth: new MockAuthProvider(
        { id: '00000000-0000-0000-0000-000000000001', email: 'perf@local', name: 'Perf' },
        { id: env.workspaceId, name: 'perf-caller' },
      ),
      git: new MockGitClient(),
      github: new MockGitHubClient(),
      secrets: new MockSecretsProvider({}),
      ...overrides,
    },
  });
}

// ---------------------------------------------------------------------------------------------
// time helpers

/** 2026-03-<day> at <hour>:00 UTC. */
export const day = (d: number, hour = 12) => new Date(Date.UTC(2026, 2, d, hour));
/** The fixture's range: 30 days, `from` inclusive, `to` exclusive. */
export const RANGE = {
  from: new Date(Date.UTC(2026, 2, 1)),
  to: new Date(Date.UTC(2026, 2, 31)),
};
export const rangeQuery = (repoId: string, r = RANGE) =>
  `repoId=${repoId}&from=${encodeURIComponent(r.from.toISOString())}&to=${encodeURIComponent(r.to.toISOString())}`;

// ---------------------------------------------------------------------------------------------
// row builders

let seq = 0;
export const uniq = (p: string) => `${p}-${(seq++).toString(36)}`;

export async function insertRepo(env: PerfEnv, fullName: string, workspaceId = env.workspaceId) {
  const [owner, name] = fullName.split('/') as [string, string];
  const [row] = await env.pg.handle.db.insert(t.repos).values({ workspaceId, owner, name, fullName }).returning();
  return row!;
}

export async function insertAgent(
  env: PerfEnv,
  o: { name: string; enabled?: boolean; workspaceId?: string },
) {
  const [row] = await env.pg.handle.db
    .insert(t.agents)
    .values({
      workspaceId: o.workspaceId ?? env.workspaceId,
      name: o.name,
      provider: 'openrouter',
      model: 'm-agent',
      systemPrompt: 'Review the diff.',
      enabled: o.enabled ?? true,
    })
    .returning();
  return row!;
}

export async function insertPr(env: PerfEnv, repoId: string, workspaceId = env.workspaceId) {
  const [row] = await env.pg.handle.db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number: seq++ + 1,
      title: 'PR',
      author: 'dev',
      branch: 'feat/x',
      base: 'main',
      headSha: 'abc123',
      status: 'open',
    })
    .returning();
  return row!;
}

export interface RunSpec {
  workspaceId?: string;
  agentId: string | null;
  prId?: string | null;
  ranAt: Date;
  status?: string;
  source?: 'local' | 'ci';
  costUsd?: number | null;
  costSource?: 'provider' | 'estimate' | 'mixed' | null;
  durationMs?: number | null;
  model?: string | null;
  /** CI runs: the recorded `owner/name`. */
  repo?: string;
  multiAgentRunId?: string | null;
}

export function runValues(env: PerfEnv, o: RunSpec): typeof t.agentRuns.$inferInsert {
  const ci = o.source === 'ci';
  return {
    workspaceId: o.workspaceId ?? env.workspaceId,
    agentId: o.agentId,
    prId: ci ? null : (o.prId ?? null),
    ranAt: o.ranAt,
    status: o.status ?? 'done',
    source: o.source ?? 'local',
    provider: 'openrouter',
    model: o.model === undefined ? 'm-a' : o.model,
    costUsd: o.costUsd === undefined ? null : o.costUsd,
    costSource: o.costSource ?? null,
    durationMs: o.durationMs === undefined ? null : o.durationMs,
    multiAgentRunId: o.multiAgentRunId ?? null,
    ...(ci
      ? { repo: o.repo ?? null, actionsRunId: uniq('ci'), actionsRunAttempt: 1, externalPrNumber: 7 }
      : {}),
  };
}

export async function insertRun(env: PerfEnv, o: RunSpec) {
  const [row] = await env.pg.handle.db.insert(t.agentRuns).values(runValues(env, o)).returning();
  return row!;
}

/** A review produced by `runId` with the given numbers of accepted / dismissed / undecided findings. */
export async function insertDecidedReview(
  env: PerfEnv,
  o: { prId: string; runId: string; agentId?: string | null; accepted: number; dismissed: number; undecided: number },
) {
  const db = env.pg.handle.db;
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId: env.workspaceId, prId: o.prId, agentId: o.agentId ?? null, runId: o.runId, kind: 'review' })
    .returning();
  const rows = findingRows(review!.id, o.accepted, o.dismissed, o.undecided);
  const findings = rows.length > 0 ? await db.insert(t.findings).values(rows).returning() : [];
  return { review: review!, findings };
}

export function findingRows(reviewId: string, accepted: number, dismissed: number, undecided: number) {
  const stamp = new Date('2026-03-20T00:00:00Z');
  const make = (n: number, decision: 'accepted' | 'dismissed' | 'none') =>
    Array.from({ length: n }, (_, i) => ({
      reviewId,
      file: 'src/a.ts',
      startLine: i + 1,
      endLine: i + 1,
      severity: 'WARNING',
      category: 'bug',
      title: `${decision} ${i}`,
      rationale: 'r',
      confidence: 0.9,
      // a lethal-trifecta finding counts like any other (D-2)
      kind: i % 2 === 0 ? 'finding' : 'lethal_trifecta',
      acceptedAt: decision === 'accepted' ? stamp : null,
      dismissedAt: decision === 'dismissed' ? stamp : null,
    }));
  return [...make(accepted, 'accepted'), ...make(dismissed, 'dismissed'), ...make(undecided, 'none')];
}

// ---------------------------------------------------------------------------------------------
// the fixture

export interface PerfFixture {
  /** The repository under test, `acme/web`, and a second repository of the same workspace, `acme/api`. */
  repoId: string;
  otherRepoId: string;
  /** `acme/web` of the FOREIGN workspace. */
  foreignRepoId: string;
  agents: {
    alpha: string;
    beta: string;
    gamma: string;
    /** Disabled, with one counted run → listed. */
    disabledActive: string;
    /** Disabled, no run → not listed. */
    disabledIdle: string;
    /** The foreign workspace's agent. */
    foreign: string;
    /** Deleted after it ran (its run lost the agent link). */
    ghostId: string;
  };
  /** An accepted finding of alpha's first run, for the decision-toggle test. */
  alphaAcceptedFindingId: string;
}

/**
 * Seeds repository `acme/web` (range = RANGE, 30 days) with the runs below; every value the tests
 * expect follows from this table.
 *
 *  agent       run   when         status   src    cost  cost_source  model  dur   decisions (acc/dis/und)
 *  alpha       a1    Mar 2        done     local  .10   provider     m-a    1000  3/1/2
 *  alpha       a2    Mar 3        done     local  .20   estimate     m-a    3000  1/1/1
 *  alpha       a3    Mar 4        failed   local  null  -            m-a    100   -
 *  alpha       a4    Mar 20       running  local  null  -            m-a    -     -        (never counted)
 *  alpha       a5    Mar 6        done     local  .30   mixed        m-b    2000  -        (multi-agent member)
 *  alpha       a6    Mar 7        done     ci     .40   (unknown)    m-c    5000  "5 accepted" review attached to the CI run
 *  alpha       a7    Feb 10       done     local  .25   provider     m-a    1000  -        (previous period)
 *  alpha       -     Mar 14       done     local  99    -            -      -     PR deleted        -> belongs to no repository
 *  alpha       -     Mar 15       done     local  97    -            -      -     PR of acme/api    -> other repository
 *  alpha       -     Mar 16       done     ci     98    -            -      -     repo acme/unimported -> not imported
 *  beta        b1    Mar 10       done     local  .50   provider     m-b    2000  0/4/0
 *  beta        b2    Mar 1 00:00  done     local  .05   estimate     m-a    4000  -        (`from` is inclusive)
 *  beta        -     Mar 31 00:00 done     local  8     -            -      -     -        (`to` is exclusive)
 *  beta        b4    Apr 15       done     local  9     -            -      -     -        (after the range; sets Last run)
 *  gamma       g1    Feb 1        done     local  null  -            -      -     -        (before the range; sets Last run)
 *  disabled    d1    Mar 12       done     local  .07   provider     m-a    500   -
 *  ghost       gh1   Mar 13       done     local  .60   provider     null   1500  2/0/0   (agent deleted afterwards)
 *  foreign     -     Mar 5 / 8    done     local/ci 96/95 -           -      -     -        (other workspace, same repo name)
 */
export async function seedPerfFixture(env: PerfEnv): Promise<PerfFixture> {
  const db = env.pg.handle.db;
  const repo = await insertRepo(env, 'acme/web');
  const otherRepo = await insertRepo(env, 'acme/api');
  const foreignRepo = await insertRepo(env, 'acme/web', env.otherWorkspaceId);

  const alpha = await insertAgent(env, { name: 'alpha' });
  const beta = await insertAgent(env, { name: 'beta' });
  const gamma = await insertAgent(env, { name: 'gamma' });
  const disabledActive = await insertAgent(env, { name: 'dis-active', enabled: false });
  const disabledIdle = await insertAgent(env, { name: 'dis-idle', enabled: false });
  const ghost = await insertAgent(env, { name: 'ghost' });
  const foreign = await insertAgent(env, { name: 'x-agent', workspaceId: env.otherWorkspaceId });

  const pr1 = await insertPr(env, repo.id);
  const pr2 = await insertPr(env, repo.id);
  const prGone = await insertPr(env, repo.id);
  const prOtherRepo = await insertPr(env, otherRepo.id);
  const prForeign = await insertPr(env, foreignRepo.id, env.otherWorkspaceId);

  const [multi] = await db.insert(t.multiAgentRuns).values({ workspaceId: env.workspaceId, prId: pr1.id }).returning();

  // alpha
  const a1 = await insertRun(env, { agentId: alpha.id, prId: pr1.id, ranAt: day(2), costUsd: 0.1, costSource: 'provider', durationMs: 1000 });
  const a2 = await insertRun(env, { agentId: alpha.id, prId: pr2.id, ranAt: day(3), costUsd: 0.2, costSource: 'estimate', durationMs: 3000 });
  await insertRun(env, { agentId: alpha.id, prId: pr1.id, ranAt: day(4), status: 'failed', durationMs: 100 });
  await insertRun(env, { agentId: alpha.id, prId: pr1.id, ranAt: day(20), status: 'running' });
  await insertRun(env, { agentId: alpha.id, prId: pr1.id, ranAt: day(6), costUsd: 0.3, costSource: 'mixed', model: 'm-b', durationMs: 2000, multiAgentRunId: multi!.id });
  const a6 = await insertRun(env, { agentId: alpha.id, source: 'ci', repo: 'ACME/Web', ranAt: day(7), costUsd: 0.4, model: 'm-c', durationMs: 5000 });
  await insertRun(env, { agentId: alpha.id, prId: pr1.id, ranAt: new Date(Date.UTC(2026, 1, 10, 12)), costUsd: 0.25, costSource: 'provider', durationMs: 1000 });
  await insertRun(env, { agentId: alpha.id, prId: prGone.id, ranAt: day(14), costUsd: 99 });
  await insertRun(env, { agentId: alpha.id, prId: prOtherRepo.id, ranAt: day(15), costUsd: 97 });
  await insertRun(env, { agentId: alpha.id, source: 'ci', repo: 'acme/unimported', ranAt: day(16), costUsd: 98 });
  // beta
  const b1 = await insertRun(env, { agentId: beta.id, prId: pr1.id, ranAt: day(10), costUsd: 0.5, costSource: 'provider', model: 'm-b', durationMs: 2000 });
  await insertRun(env, { agentId: beta.id, prId: pr2.id, ranAt: RANGE.from, costUsd: 0.05, costSource: 'estimate', durationMs: 4000 });
  await insertRun(env, { agentId: beta.id, prId: pr2.id, ranAt: RANGE.to, costUsd: 8, costSource: 'provider' });
  await insertRun(env, { agentId: beta.id, prId: pr1.id, ranAt: new Date(Date.UTC(2026, 3, 15, 12)), costUsd: 9, costSource: 'provider' });
  // gamma, disabled agent, ghost
  await insertRun(env, { agentId: gamma.id, prId: pr1.id, ranAt: new Date(Date.UTC(2026, 1, 1, 12)) });
  await insertRun(env, { agentId: disabledActive.id, prId: pr1.id, ranAt: day(12), costUsd: 0.07, costSource: 'provider', durationMs: 500 });
  const gh1 = await insertRun(env, { agentId: ghost.id, prId: pr1.id, ranAt: day(13), costUsd: 0.6, costSource: 'provider', model: null, durationMs: 1500 });
  // foreign workspace — same repository name, must never be visible
  await insertRun(env, { workspaceId: env.otherWorkspaceId, agentId: foreign.id, prId: prForeign.id, ranAt: day(5), costUsd: 96, costSource: 'provider' });
  await insertRun(env, { workspaceId: env.otherWorkspaceId, agentId: foreign.id, source: 'ci', repo: 'acme/web', ranAt: day(8), costUsd: 95 });

  // decisions
  const r1 = await insertDecidedReview(env, { prId: pr1.id, runId: a1.id, agentId: alpha.id, accepted: 3, dismissed: 1, undecided: 2 });
  await insertDecidedReview(env, { prId: pr2.id, runId: a2.id, agentId: alpha.id, accepted: 1, dismissed: 1, undecided: 1 });
  await insertDecidedReview(env, { prId: pr1.id, runId: b1.id, agentId: beta.id, accepted: 0, dismissed: 4, undecided: 0 });
  await insertDecidedReview(env, { prId: pr1.id, runId: gh1.id, agentId: ghost.id, accepted: 2, dismissed: 0, undecided: 0 });
  // a review wrongly attached to a CI run: CI runs contribute no findings (AC-13)
  await insertDecidedReview(env, { prId: pr1.id, runId: a6.id, agentId: alpha.id, accepted: 5, dismissed: 0, undecided: 0 });

  // the agent is deleted AFTER it ran: its runs keep existing with agent_id = null (AC-53)
  await db.delete(t.agents).where(eq(t.agents.id, ghost.id));
  // the pull request is deleted: its run keeps existing with pr_id = null (AC-65)
  await db.delete(t.pullRequests).where(eq(t.pullRequests.id, prGone.id));

  const alphaAccepted = r1.findings.find((f) => f.acceptedAt != null)!;
  return {
    repoId: repo.id,
    otherRepoId: otherRepo.id,
    foreignRepoId: foreignRepo.id,
    agents: {
      alpha: alpha.id,
      beta: beta.id,
      gamma: gamma.id,
      disabledActive: disabledActive.id,
      disabledIdle: disabledIdle.id,
      foreign: foreign.id,
      ghostId: ghost.id,
    },
    alphaAcceptedFindingId: alphaAccepted.id,
  };
}

// ---------------------------------------------------------------------------------------------
// volume (NFR-1)

/**
 * `perPeriod` counted runs in RANGE and `perPeriod` in the previous period of the same length, spread
 * over `agentIds`; 70 % local runs (each with a review of one accepted and one dismissed finding),
 * 30 % CI runs of `acme/web`. Priced, with a model and a duration. Runs ANALYZE afterwards (see below)
 * unless `analyze: false` — then the tables are also kept away from autovacuum, so the planner has NO
 * statistics for the whole test (a cold database, NFR-1).
 */
export async function seedVolume(
  env: PerfEnv,
  o: { repoId: string; repoFullName: string; agentIds: string[]; perPeriod: number; analyze?: boolean },
) {
  const db = env.pg.handle.db;
  const analyze = o.analyze ?? true;
  if (!analyze) {
    // autovacuum would otherwise ANALYZE the bulk-loaded tables within a minute and make "cold" a race
    for (const table of ['agent_runs', 'reviews', 'findings']) {
      await env.pg.handle.sql.unsafe(`alter table ${table} set (autovacuum_enabled = false)`);
    }
  }
  const pr = await insertPr(env, o.repoId);
  const span = RANGE.to.getTime() - RANGE.from.getTime();
  const specs: RunSpec[] = [];
  for (const period of [0, -1]) {
    const base = RANGE.from.getTime() + period * span;
    for (let i = 0; i < o.perPeriod; i++) {
      const ci = i % 10 >= 7;
      specs.push({
        agentId: o.agentIds[i % o.agentIds.length]!,
        prId: pr.id,
        source: ci ? 'ci' : 'local',
        repo: o.repoFullName.toUpperCase(),
        ranAt: new Date(base + Math.floor((i * span) / o.perPeriod)),
        status: i % 13 === 0 ? 'failed' : 'done',
        costUsd: (i % 17) / 100 + 0.01,
        costSource: ci ? null : (['provider', 'estimate', 'mixed'] as const)[i % 3]!,
        durationMs: 500 + (i % 50) * 100,
        model: `model-${i % 5}`,
      });
    }
  }
  const inserted: { id: string; source: string }[] = [];
  for (let i = 0; i < specs.length; i += 1000) {
    const rows = await db
      .insert(t.agentRuns)
      .values(specs.slice(i, i + 1000).map((s) => runValues(env, s)))
      .returning({ id: t.agentRuns.id, source: t.agentRuns.source });
    inserted.push(...rows);
  }
  const local = inserted.filter((r) => r.source === 'local');
  for (let i = 0; i < local.length; i += 1000) {
    const chunk = local.slice(i, i + 1000);
    const reviews = await db
      .insert(t.reviews)
      .values(chunk.map((r) => ({ workspaceId: env.workspaceId, prId: pr.id, runId: r.id, kind: 'review' as const })))
      .returning({ id: t.reviews.id });
    await db.insert(t.findings).values(reviews.flatMap((rv) => findingRows(rv.id, 1, 1, 0)));
  }
  // Steady state: autovacuum would ANALYZE these freshly bulk-loaded tables within a minute. Without
  // statistics the planner picks nested loops for the decision join and a read takes ~17 s (measured).
  if (analyze) await env.pg.handle.sql`analyze`;
  return { runs: specs.length, localRuns: local.length };
}
