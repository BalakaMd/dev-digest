import { describe, it, expect } from 'vitest';
import type { GitHubClient, IssueMeta, RepoRef } from '@devdigest/shared';
import { IntentClassification, IntentService } from '../src/modules/intent/service.js';
import type { PullContext, StoredIntentFields, UpsertIntentValues } from '../src/modules/intent/types.js';
import { MockGitClient, MockGitHubClient, MockLLMProvider } from '../src/adapters/mocks.js';

/**
 * A `MockGitHubClient` whose `getIssue` returns a body of a fixed byte size,
 * so caps tests can drive the per-source (`MAX_ISSUE_BYTES`) and total
 * (`TOTAL_FETCH_BUDGET_BYTES`) budgets deterministically. Everything else
 * (files, currentLogin, …) is inherited unchanged.
 */
class LargeIssueGitHubClient extends MockGitHubClient {
  constructor(private bodyBytes: number) {
    super();
  }
  override async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    return { number: n, title: `Issue #${n}`, body: 'x'.repeat(this.bodyBytes), state: 'open' };
  }
}

/**
 * Hermetic unit coverage for `IntentService`: an in-memory fake repository +
 * `MockLLMProvider` + `MockGitHubClient` + `MockGitClient` — no Postgres, no
 * network. `test/intent.it.test.ts` covers the same behaviour end to end
 * through the HTTP routes against real Postgres.
 */

const WORKSPACE = 'ws-1';
const REPO = { owner: 'acme', name: 'api' };

const FIXTURE = {
  summary: 'Adds rate limiting to public API endpoints.',
  in_scope: ['Add a token-bucket limiter middleware', 'Apply it to /api/public/*'],
  out_of_scope: ['Auth changes'],
};

class FakeIntentRepository {
  public upserted: { prId: string; values: UpsertIntentValues }[] = [];
  private stored = new Map<string, StoredIntentFields>();

  constructor(private context: PullContext | undefined) {}

  async getPullContext(_workspaceId: string, prId: string): Promise<PullContext | undefined> {
    if (!this.context || this.context.prId !== prId) return undefined;
    return this.context;
  }

  async getPullHeadSha(_workspaceId: string, prId: string): Promise<string | undefined> {
    if (!this.context || this.context.prId !== prId) return undefined;
    return this.context.headSha;
  }

  async getIntent(_workspaceId: string, prId: string): Promise<StoredIntentFields | undefined> {
    return this.stored.get(prId);
  }

  async upsert(
    _workspaceId: string,
    prId: string,
    values: UpsertIntentValues,
  ): Promise<StoredIntentFields> {
    this.upserted.push({ prId, values });
    const row: StoredIntentFields = {
      pr_id: prId,
      summary: values.summary,
      in_scope: values.inScope,
      out_of_scope: values.outOfScope,
      confidence: values.confidence as StoredIntentFields['confidence'],
      sources: values.sources,
      head_sha: values.headSha,
      provider: values.provider,
      model: values.model,
      tokens_in: values.tokensIn,
      tokens_out: values.tokensOut,
      cost_usd: values.costUsd,
      derived_at: new Date().toISOString(),
    };
    this.stored.set(prId, row);
    return row;
  }
}

function makeContext(overrides: Partial<PullContext> = {}): PullContext {
  return {
    prId: 'pr-1',
    number: 482,
    title: 'Add rate limiting to public API endpoints',
    body: null,
    headSha: 'a1b2c3d4',
    repo: REPO,
    files: [
      { path: 'src/api/public/index.ts', patch: '@@ -1,1 +1,2 @@ handler' },
      { path: 'src/middleware/ratelimit.ts', patch: '@@ -0,0 +1,10 @@ new file' },
    ],
    ...overrides,
  };
}

function makeService(opts: {
  context?: PullContext;
  github?: GitHubClient;
  githubUnavailable?: boolean;
  git?: MockGitClient;
  llm?: MockLLMProvider;
}) {
  const repo = new FakeIntentRepository(opts.context);
  const llm = opts.llm ?? new MockLLMProvider('openai', { structuredBySchema: { IntentClassification: FIXTURE } });
  const github = opts.github ?? new MockGitHubClient();
  const git = opts.git ?? new MockGitClient();
  const service = new IntentService({
    repo,
    llm: async () => llm,
    github: opts.githubUnavailable
      ? async () => {
          throw new Error('GITHUB_TOKEN is not configured');
        }
      : async () => github,
    git,
    countTokens: (t) => Math.ceil(t.length / 4),
    resolveModel: async () => ({ provider: 'openrouter', model: 'deepseek/deepseek-v4-flash' }),
  });
  return { service, repo, llm, github, git };
}

describe('IntentService.derive', () => {
  it('empty description still derives an intent from title + files, confidence low', async () => {
    const { service, repo } = makeService({ context: makeContext({ body: '' }) });
    const record = await service.derive(WORKSPACE, 'pr-1');
    expect(record.confidence).toBe('low');
    expect(record.summary).toBe(FIXTURE.summary);
    expect(record.stale).toBe(false);
    expect(repo.upserted).toHaveLength(1);
    const sourceKinds = repo.upserted[0]!.values.sources.map((s) => s.kind);
    expect(sourceKinds).toContain('title');
    expect(sourceKinds).toContain('files');
    expect(sourceKinds).not.toContain('description');
  });

  it('a linked plan doc is fetched and marked used; the prompt carries no diff body', async () => {
    const github = new MockGitHubClient({ files: { 'docs/plan.md': 'Build a rate limiter for public endpoints.' } });
    const { service, repo, llm } = makeService({
      context: makeContext({ body: 'See [the plan](docs/plan.md) for details.' }),
      github,
    });
    await service.derive(WORKSPACE, 'pr-1');
    const sources = repo.upserted[0]!.values.sources;
    const planSource = sources.find((s) => s.kind === 'plan');
    expect(planSource).toMatchObject({ ref: 'docs/plan.md', status: 'used' });

    const call = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    const userMessage = call.messages.find((m) => m.role === 'user')!.content;
    expect(userMessage).toContain('docs/plan.md');
    expect(userMessage).toContain('Build a rate limiter');
    expect(userMessage).not.toMatch(/\n\+/); // no diff body lines
  });

  it('a missing linked issue is unreachable, forces confidence low, and its content is never invented', async () => {
    const github = new MockGitHubClient({ missingIssues: [471] });
    const { service, repo, llm } = makeService({
      context: makeContext({ body: 'Closes #471. '.padEnd(60, 'x') }),
      github,
    });
    const record = await service.derive(WORKSPACE, 'pr-1');
    expect(record.confidence).toBe('low');
    const issueSource = repo.upserted[0]!.values.sources.find((s) => s.kind === 'issue');
    expect(issueSource).toMatchObject({ ref: '#471', status: 'unreachable' });

    const call = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      messages: { role: string; content: string }[];
    };
    const userMessage = call.messages.find((m) => m.role === 'user')!.content;
    expect(userMessage).not.toContain('issue:#471');
    expect(userMessage).toContain('Unavailable context: #471 (unreachable)');
  });

  it('with no GitHub token, a linked doc is read from the local clone instead', async () => {
    const git = new MockGitClient({ files: { 'docs/plan.md': 'Cloned plan content.' } });
    const { service, repo } = makeService({
      context: makeContext({ body: 'See [the plan](docs/plan.md).' }),
      githubUnavailable: true,
      git,
    });
    await service.derive(WORKSPACE, 'pr-1');
    const planSource = repo.upserted[0]!.values.sources.find((s) => s.kind === 'plan');
    expect(planSource).toMatchObject({ ref: 'docs/plan.md', status: 'used' });
    expect(planSource!.detail).toMatch(/local clone/);
  });

  it('uses the resolveModel choice for the classifier call', async () => {
    const { service, llm } = makeService({ context: makeContext() });
    await service.derive(WORKSPACE, 'pr-1');
    const call = llm.calls.find((c) => c.method === 'completeStructured')!.req as {
      model: string;
      schemaName: string;
    };
    expect(call).toMatchObject({ model: 'deepseek/deepseek-v4-flash', schemaName: 'IntentClassification' });
  });

  it('throws NotFoundError when the PR is not in the workspace', async () => {
    const { service } = makeService({ context: undefined });
    await expect(service.derive(WORKSPACE, 'missing-pr')).rejects.toThrow(/not found/i);
  });

  it('truncates a fetched issue body over the 20 KB per-source cap', async () => {
    const github = new LargeIssueGitHubClient(25_000); // > MAX_ISSUE_BYTES
    const { service, repo } = makeService({
      context: makeContext({ body: 'Closes #1.'.padEnd(60, ' x') }),
      github,
    });
    await service.derive(WORKSPACE, 'pr-1');
    const issueSource = repo.upserted[0]!.values.sources.find((s) => s.kind === 'issue');
    expect(issueSource!.status).toBe('truncated');
    expect(issueSource!.bytes).toBeLessThanOrEqual(20_000);
  });

  it('skips sources once the 60 KB total fetch budget is exhausted, after truncating what fits', async () => {
    // Three issues at 20 KB each exactly exhaust the 60 KB total budget, so a
    // doc referenced afterwards must be `skipped`, never fetched.
    const github = new LargeIssueGitHubClient(20_000);
    const { service, repo } = makeService({
      context: makeContext({
        body: 'Closes #1, #2, #3. See [the plan](docs/plan.md) for details.'.padEnd(80, ' x'),
      }),
      github,
    });
    await service.derive(WORKSPACE, 'pr-1');
    const sources = repo.upserted[0]!.values.sources;
    const issueSources = sources.filter((s) => s.kind === 'issue');
    expect(issueSources).toHaveLength(3);
    for (const s of issueSources) {
      expect(s.status).toBe('truncated');
      expect(s.bytes).toBeLessThanOrEqual(20_000);
    }
    const docSource = sources.find((s) => s.kind === 'plan' || s.kind === 'spec');
    expect(docSource).toMatchObject({ ref: 'docs/plan.md', status: 'skipped', bytes: null });
  });
});

describe('IntentService.getForReview', () => {
  it('returns undefined (never throws) when the LLM call fails', async () => {
    const llm = new MockLLMProvider('openai', {});
    llm.completeStructured = async () => {
      throw new Error('rate limited');
    };
    const { service } = makeService({ context: makeContext(), llm });
    const result = await service.getForReview(WORKSPACE, 'pr-1');
    expect(result).toBeUndefined();
  });

  it('derives once and reuses the stored intent on a second call', async () => {
    const { service, repo } = makeService({ context: makeContext() });
    const first = await service.getForReview(WORKSPACE, 'pr-1');
    const second = await service.getForReview(WORKSPACE, 'pr-1');
    expect(first?.summary).toBe(FIXTURE.summary);
    expect(second?.summary).toBe(FIXTURE.summary);
    expect(repo.upserted).toHaveLength(1); // only derived once
  });
});

describe('IntentClassification schema', () => {
  it('has no optional fields (strict structured output)', () => {
    const parsed = IntentClassification.safeParse({ summary: 'x', in_scope: [], out_of_scope: [] });
    expect(parsed.success).toBe(true);
  });
});

describe('IntentService.derive — logging redaction', () => {
  it('never logs a fetched doc body, a secret-looking value, or a URL query string', async () => {
    const secretMarker = 'sk_live_SECRETVALUE12345';
    const github = new MockGitHubClient({
      files: { 'docs/plan.md': `Plan content containing ${secretMarker} inline.` },
    });
    const body = (
      'See [the plan](docs/plan.md) for details. ' +
      'Ticket: https://acme.atlassian.net/browse/X-1?token=SHOULD_NOT_APPEAR'
    ).padEnd(80, ' x');

    const logged: { msg: string; data?: unknown }[] = [];
    const log = {
      info: (msg: string, data?: unknown) => logged.push({ msg, data }),
      error: (msg: string, data?: unknown) => logged.push({ msg, data }),
    };

    const { service } = makeService({ context: makeContext({ body }), github });
    await service.derive(WORKSPACE, 'pr-1', log);

    expect(logged.length).toBeGreaterThan(0); // the log spy actually captured calls
    const serialized = logged.map((l) => `${l.msg} ${JSON.stringify(l.data ?? {})}`).join('\n');
    expect(serialized).not.toContain(secretMarker);
    expect(serialized).not.toContain('SHOULD_NOT_APPEAR');
    expect(serialized).not.toContain('?token=');
    // The sanitized ref keeps host + path only, never the query string.
    expect(serialized).toContain('acme.atlassian.net/browse/X-1');
  });
});
