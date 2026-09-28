/**
 * `GET /pulls/:id/smart-diff` (S2) — the response passes `SmartDiff.parse`,
 * grouping works before any review exists, only the newest review per agent
 * feeds `finding_lines` (D2), and viewing the diff never calls an LLM
 * (`server/INSIGHTS.md` § hermetic tests: this app is built with mock
 * providers + empty secrets so an unmocked call would throw, not go live).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockSecretsProvider } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { SmartDiff, type SmartDiffFile } from '@devdigest/shared';
import type { FastifyInstance } from 'fastify';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  files: { path: string; additions: number; deletions: number }[],
) {
  const name = `smart-diff-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 1,
      title: 'Smart diff fixture PR',
      author: 'marisa.koch',
      branch: 'feat/smart-diff',
      base: 'main',
      headSha: 'abc123',
      additions: files.reduce((s, f) => s + f.additions, 0),
      deletions: files.reduce((s, f) => s + f.deletions, 0),
      filesCount: files.length,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values(files.map((f) => ({ ...f, prId: pr!.id })));
  return { repo: repo!, pr: pr! };
}

/** Insert a review + its findings directly, bypassing the run pipeline. */
async function insertReview(
  db: PgFixture['handle']['db'],
  opts: {
    workspaceId: string;
    prId: string;
    agentId: string | null;
    kind?: 'review' | 'summary';
    createdAt: Date;
    findings?: { file: string; start_line: number }[];
  },
) {
  const [review] = await db
    .insert(t.reviews)
    .values({
      workspaceId: opts.workspaceId,
      prId: opts.prId,
      agentId: opts.agentId,
      runId: null,
      kind: opts.kind ?? 'review',
      verdict: 'comment',
      summary: 'fixture review',
      score: 90,
      model: 'gpt-4.1',
      createdAt: opts.createdAt,
    })
    .returning();
  const findings = opts.findings ?? [];
  if (findings.length > 0) {
    await db.insert(t.findings).values(
      findings.map((f) => ({
        reviewId: review!.id,
        file: f.file,
        startLine: f.start_line,
        endLine: f.start_line,
        severity: 'WARNING',
        category: 'style',
        title: 'fixture finding',
        rationale: 'fixture rationale',
        confidence: 0.5,
      })),
    );
  }
  return review!;
}

const FIXTURE_FILES = [
  { path: 'pnpm-lock.yaml', additions: 5, deletions: 2 },
  { path: 'src/a.ts', additions: 4, deletions: 1 },
  { path: 'src/a.test.ts', additions: 3, deletions: 0 },
  { path: 'README.md', additions: 1, deletions: 0 },
];

function fileByPath(diff: SmartDiff, path: string): SmartDiffFile {
  for (const group of diff.groups) {
    const found = group.files.find((f) => f.path === path);
    if (found) return found;
  }
  throw new Error(`fixture file not found in response: ${path}`);
}

function roleOf(diff: SmartDiff, path: string): string {
  for (const group of diff.groups) {
    if (group.files.some((f) => f.path === path)) return group.role;
  }
  throw new Error(`fixture file not found in response: ${path}`);
}

d('GET /pulls/:id/smart-diff (Testcontainers pg)', () => {
  let pg: PgFixture;
  let app: FastifyInstance;
  let workspaceId: string;
  let mockOpenAI: MockLLMProvider;
  let mockOpenRouter: MockLLMProvider;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;

    // Defence in depth: even though `smartDiff` never touches the container's
    // LLM adapters, inject mocks + empty secrets so a regression that DID call
    // one would throw/record a call rather than silently reaching a real
    // provider (server/INSIGHTS.md § hermetic-by-default).
    mockOpenAI = new MockLLMProvider('openai', { structured: {} });
    mockOpenRouter = new MockLLMProvider('openai', { structured: {} });
    app = await buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        secrets: new MockSecretsProvider({}),
        llm: { openai: mockOpenAI, openrouter: mockOpenRouter },
      },
    });
  });
  afterAll(async () => {
    await app?.close();
    await pg?.stop();
  });

  it('groups files by role and returns empty finding_lines before any review exists', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, FIXTURE_FILES);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const diff = SmartDiff.parse(res.json());

    expect(diff.groups.map((g) => g.role)).toEqual(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
    expect(roleOf(diff, 'pnpm-lock.yaml')).toBe('boilerplate');
    expect(roleOf(diff, 'src/a.ts')).toBe('core');
    expect(roleOf(diff, 'src/a.test.ts')).toBe('tests');
    expect(roleOf(diff, 'README.md')).toBe('docs');
    expect(diff.groups.find((g) => g.role === 'wiring')!.files).toEqual([]);

    for (const group of diff.groups) {
      for (const file of group.files) {
        expect(file.finding_lines).toEqual([]);
      }
    }
  });

  it('feeds finding_lines only from the newest review per agent (D2)', async () => {
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, FIXTURE_FILES);
    const agentA = randomUUID();
    const agentB = randomUUID();
    const t0 = new Date('2026-01-01T00:00:00Z');

    // Agent A: an older review (superseded) and a newer one — only the newer
    // review's finding should surface.
    await insertReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA,
      createdAt: new Date(t0.getTime()),
      findings: [{ file: 'src/a.ts', start_line: 5 }],
    });
    await insertReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentA,
      createdAt: new Date(t0.getTime() + 60_000),
      findings: [{ file: 'src/a.ts', start_line: 8 }],
    });
    // Agent B: one review, on a different file.
    await insertReview(pg.handle.db, {
      workspaceId,
      prId: pr.id,
      agentId: agentB,
      createdAt: new Date(t0.getTime() + 30_000),
      findings: [{ file: 'src/a.test.ts', start_line: 3 }],
    });

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(200);
    const diff = SmartDiff.parse(res.json());

    // The lock file still lands in boilerplate regardless of any review.
    expect(roleOf(diff, 'pnpm-lock.yaml')).toBe('boilerplate');
    // Only the NEWER agent-A review's line survives — the superseded line-5
    // finding is dropped.
    expect(fileByPath(diff, 'src/a.ts').finding_lines).toEqual([8]);
    expect(fileByPath(diff, 'src/a.test.ts').finding_lines).toEqual([3]);
    expect(fileByPath(diff, 'README.md').finding_lines).toEqual([]);
  });

  it('returns 404 for an unknown PR id', async () => {
    const res = await app.inject({ method: 'GET', url: `/pulls/${randomUUID()}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 404 for a PR that belongs to a different workspace', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${randomUUID()}` })
      .returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id, FIXTURE_FILES);

    // The request context always resolves the seeded DEFAULT workspace, so a
    // PR that lives in `otherWs` must be invisible.
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/smart-diff` });
    expect(res.statusCode).toBe(404);
  });

  it('returns 422 for a non-uuid id', async () => {
    const res = await app.inject({ method: 'GET', url: '/pulls/not-a-uuid/smart-diff' });
    expect(res.statusCode).toBe(422);
  });

  it('never calls an LLM provider to view the smart diff', async () => {
    // By this point in the suite several smart-diff requests (incl. ones with
    // reviews/findings present) have already been made against `app`, which
    // shares these mock providers across all tests in this file.
    expect(mockOpenAI.calls).toEqual([]);
    expect(mockOpenRouter.calls).toEqual([]);
  });
});
