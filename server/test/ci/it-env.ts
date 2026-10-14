import { beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, type PgFixture } from '../helpers/pg.js';
import { buildApp } from '../../src/app.js';
import { loadConfig } from '../../src/platform/config.js';
import { seed } from '../../src/db/seed.js';
import * as t from '../../src/db/schema.js';
import {
  MockGitClient,
  MockGitHubClient,
  MockRunnerBundle,
  MockSecretsProvider,
} from '../../src/adapters/mocks.js';
import type { InsertCiRunInput } from '../../src/modules/ci/types.js';

/**
 * Shared setup of the ci integration tests: a real Postgres (testcontainers, started once
 * per test file), the default workspace, a hermetic app (MockGitHubClient, MockSecretsProvider,
 * MockRunnerBundle) and small seeding helpers.
 */
export interface CiEnv {
  pg: PgFixture;
  workspaceId: string;
  otherWorkspaceId: string;
}

export function useCiDb(): CiEnv {
  const env = {} as CiEnv;
  beforeAll(async () => {
    env.pg = await startPg();
    await seed(env.pg.handle.db);
    const db = env.pg.handle.db;
    const [ws] = await db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    env.workspaceId = ws!.id;
    const [other] = await db.insert(t.workspaces).values({ name: 'ci-other-workspace' }).returning();
    env.otherWorkspaceId = other!.id;
  });
  afterAll(async () => {
    await env.pg?.stop();
  });
  return env;
}

let seq = 0;
export const uniq = (p: string) => `${p}-${Date.now().toString(36)}-${seq++}`;

export async function insertAgent(
  env: CiEnv,
  o: { workspaceId?: string; name?: string; provider?: 'openai' | 'openrouter' } = {},
) {
  const [row] = await env.pg.handle.db
    .insert(t.agents)
    .values({
      workspaceId: o.workspaceId ?? env.workspaceId,
      name: o.name ?? uniq('agent'),
      provider: o.provider ?? 'openrouter',
      model: 'anthropic/claude-sonnet',
      systemPrompt: 'Review the diff.',
    })
    .returning();
  return row!;
}

export async function insertRepo(env: CiEnv, fullName: string, workspaceId = env.workspaceId) {
  const [owner, name] = fullName.split('/') as [string, string];
  const [row] = await env.pg.handle.db
    .insert(t.repos)
    .values({ workspaceId, owner, name, fullName })
    .returning();
  return row!;
}

export const ciRunInput = (over: Partial<InsertCiRunInput> & Pick<InsertCiRunInput, 'agentId' | 'installationId' | 'repo'>): InsertCiRunInput => ({
  prNumber: 7,
  actionsRunId: uniq('run'),
  actionsRunAttempt: 1,
  actionsJobUrl: 'https://github.com/acme/web/actions/runs/1',
  headSha: 'deadbeef',
  ranAt: new Date('2026-03-01T10:00:00Z'),
  status: 'done',
  model: 'anthropic/claude-sonnet',
  durationMs: 12_000,
  costUsd: 0.02,
  findingsCount: 2,
  blockers: 0,
  verdict: 'comment',
  trace: null,
  ...over,
});

export function makeApp(env: CiEnv, o: { github?: MockGitHubClient; secrets?: Record<string, string> } = {}) {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
  return buildApp({
    config,
    db: env.pg.handle.db,
    overrides: {
      git: new MockGitClient(),
      github: o.github ?? new MockGitHubClient(),
      secrets: new MockSecretsProvider(o.secrets ?? { GITHUB_TOKEN: 'ghp_not_a_real_token_for_tests' }),
      runnerBundle: new MockRunnerBundle(),
    },
  });
}
