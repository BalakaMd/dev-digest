import type { z } from 'zod';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Embedder,
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  PathPullHistoryQuery,
  PathPullHistory,
  GitClient,
  CloneOptions,
  UnifiedDiff,
  BlameLine,
  GitCommit,
  CodeIndex,
  CodeMatch,
  CodeSymbol,
  CodeReference,
  AuthProvider,
  AuthUser,
  AuthWorkspace,
  SecretsProvider,
  SecretKey,
  ContextDocContent,
  ContextDocEntry,
  ContextDocSource,
} from '@devdigest/shared';
import { CONTEXT_DOC_MAX_BYTES } from '@devdigest/shared';
import {
  ContextDocError,
  type ContextDocListResult,
  type ContextDocScope,
  type ContextDocStore,
  type EffectiveContextDoc,
  type LocalDocWrite,
} from './context-docs/types.js';
import { DEFAULT_CONTEXT_GLOBS, compileGlobs, docTypeOf, searchRoots } from './context-docs/glob.js';
import { createHash } from 'node:crypto';
import { parseUnifiedDiff } from './git/diff-parser.js';

/**
 * Deterministic MOCK adapters for tests/dev — NO real network. Each mirrors the
 * adapter interface. The mock LLM returns a caller-supplied fixture (or a default)
 * for completeStructured, so review/grounding flows can be tested end-to-end.
 */

// ---------- Mock LLM ----------
export interface MockLLMOptions {
  models?: ModelInfo[];
  /** Fixture returned by completeStructured (validated against the schema). */
  structured?: unknown;
  /**
   * Per-schemaName fixtures for multi-call flows (e.g. the conventions 2-step
   * dialogue: 'ConventionFileSelection' then 'ConventionExtraction'). Looked up
   * by req.schemaName; falls back to `structured` when no entry matches.
   */
  structuredBySchema?: Record<string, unknown>;
  completionText?: string;
  embedding?: number[];
}

export class MockLLMProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  public calls: { method: string; req: unknown }[] = [];

  constructor(
    id: 'openai' | 'anthropic' = 'openai',
    private opts: MockLLMOptions = {},
  ) {
    this.id = id;
  }

  async listModels(): Promise<ModelInfo[]> {
    this.calls.push({ method: 'listModels', req: null });
    return (
      this.opts.models ?? [
        { id: 'gpt-4.1', provider: this.id === 'anthropic' ? 'anthropic' : 'openai' },
      ]
    );
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    this.calls.push({ method: 'complete', req });
    return {
      text: this.opts.completionText ?? 'mock completion',
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
    };
  }

  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.calls.push({ method: 'completeStructured', req });
    const fixture = this.opts.structuredBySchema?.[req.schemaName] ?? this.opts.structured ?? {};
    const parsed = (req.schema as z.ZodType<T>).safeParse(fixture);
    if (!parsed.success) {
      throw new Error(`MockLLMProvider fixture failed schema: ${parsed.error.message}`);
    }
    return {
      data: parsed.data,
      model: req.model,
      tokensIn: 100,
      tokensOut: 50,
      costUsd: 0.001,
      raw: JSON.stringify(fixture),
      attempts: 1,
    };
  }

  async embed(texts: string[]): Promise<number[][]> {
    this.calls.push({ method: 'embed', req: texts });
    return texts.map(() => this.opts.embedding ?? new Array(1536).fill(0));
  }
}

// ---------- Mock Embedder ----------
export class MockEmbedder implements Embedder {
  readonly dims = 1536;
  async embed(texts: string[]): Promise<number[][]> {
    return texts.map((_, i) => new Array(1536).fill(0).map((_, j) => (i + j) % 2));
  }
}

// ---------- Mock GitHub ----------
export interface MockGitHubOptions {
  pulls?: PrMeta[];
  detail?: Partial<PrDetail>;
  login?: string;
  /** Existing inline review comments returned by listReviewComments. */
  comments?: PrReviewComment[];
  /** Files readable via getFileContent, keyed by path. Unknown paths throw. */
  files?: Record<string, string>;
  /** Issue numbers for which getIssue throws (simulates 404 / no permission). */
  missingIssues?: number[];
  /** Result of listPathPullHistory (default: no pulls for every path). */
  pathHistory?: (q: PathPullHistoryQuery) => PathPullHistory;
  /** When set, listPathPullHistory throws it. */
  pathHistoryError?: Error;
}

export class MockGitHubClient implements GitHubClient {
  public posted: { n: number; review: GitHubReviewPayload }[] = [];
  public openedPrs: OpenPrPayload[] = [];
  public committed: CommitFilesPayload[] = [];
  public createdComments: CreateReviewCommentInput[] = [];
  public pathHistoryQueries: { repo: RepoRef; q: PathPullHistoryQuery }[] = [];

  constructor(private opts: MockGitHubOptions = {}) {}

  async listPullRequests(_repo: RepoRef): Promise<PrMeta[]> {
    return (
      this.opts.pulls ?? [
        {
          number: 482,
          title: 'Add rate limiting to public API endpoints',
          author: 'marisa.koch',
          branch: 'feat/rate-limit-public',
          base: 'main',
          head_sha: 'a1b2c3d4',
          additions: 247,
          deletions: 38,
          files_count: 9,
          status: 'open',
          opened_at: '2026-06-01T00:00:00Z',
          updated_at: '2026-06-01T03:00:00Z',
        },
      ]
    );
  }

  async getPullRequest(_repo: RepoRef, n: number): Promise<PrDetail> {
    const base: PrDetail = {
      number: n,
      title: 'Add rate limiting to public API endpoints',
      author: 'marisa.koch',
      branch: 'feat/rate-limit-public',
      base: 'main',
      head_sha: 'a1b2c3d4',
      additions: 247,
      deletions: 38,
      files_count: 9,
      status: 'open',
      body: 'Add rate limiting. Closes #471.',
      files: [
        {
          path: 'src/config.ts',
          additions: 4,
          deletions: 0,
          patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
        },
      ],
      commits: [
        { sha: 'a1b2c3d4', message: 'Add limiter', author: 'marisa.koch', committed_at: null },
      ],
      linked_issue: null,
    };
    return { ...base, ...this.opts.detail };
  }

  async postReview(_repo: RepoRef, n: number, review: GitHubReviewPayload): Promise<{ id: string }> {
    this.posted.push({ n, review });
    return { id: `mock-review-${n}` };
  }

  async listReviewComments(_repo: RepoRef, _n: number): Promise<PrReviewComment[]> {
    return this.opts.comments ?? [];
  }

  async createReviewComment(
    _repo: RepoRef,
    _n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    this.createdComments.push(input);
    return {
      id: this.createdComments.length,
      path: input.path,
      line: input.line,
      original_line: input.line,
      side: input.side ?? 'RIGHT',
      body: input.body,
      user: this.opts.login ?? 'mock-user',
      created_at: '2026-06-01T00:00:00Z',
      html_url: `https://github.com/mock/mock/pull/1#discussion_r${this.createdComments.length}`,
      in_reply_to_id: input.inReplyTo ?? null,
      is_outdated: false,
    };
  }

  async openPullRequest(_repo: RepoRef, payload: OpenPrPayload): Promise<{ url: string }> {
    this.openedPrs.push(payload);
    return { url: 'https://github.com/mock/mock/pull/1' };
  }

  async commitFiles(_repo: RepoRef, payload: CommitFilesPayload): Promise<{ branch: string }> {
    this.committed.push(payload);
    return { branch: payload.branch };
  }

  async findOpenPr(_repo: RepoRef, branch: string): Promise<{ url: string } | null> {
    const pr = this.openedPrs.find((p) => p.head === branch);
    return pr ? { url: 'https://github.com/mock/mock/pull/1' } : null;
  }

  async getIssue(_repo: RepoRef, n: number): Promise<IssueMeta> {
    if (this.opts.missingIssues?.includes(n)) {
      throw new Error(`Issue #${n} not found`);
    }
    return { number: n, title: `Issue #${n}`, body: 'mock issue', state: 'open' };
  }

  async getFileContent(_repo: RepoRef, path: string, _ref: string): Promise<string> {
    const content = this.opts.files?.[path];
    if (content === undefined) {
      throw new Error(`${path} not found`);
    }
    return content;
  }

  async listPathPullHistory(repo: RepoRef, q: PathPullHistoryQuery): Promise<PathPullHistory> {
    this.pathHistoryQueries.push({ repo, q });
    if (this.opts.pathHistoryError) throw this.opts.pathHistoryError;
    return (
      this.opts.pathHistory?.(q) ?? {
        refFound: true,
        paths: q.paths.map((path) => ({ path, pulls: [] })),
      }
    );
  }

  async currentLogin(): Promise<string> {
    return this.opts.login ?? 'mock-user';
  }
}

// ---------- Mock Git ----------
export interface MockGitOptions {
  diff?: string;
  files?: Record<string, string>;
  /** Name-only diff result (drives the incremental indexer's "changed files since X" path). */
  diffNameOnly?: string[];
  /** Override `currentHead()` so tests can simulate "sha unchanged since last index". */
  head?: string;
  /** Head `currentHead()` returns AFTER `sync()` runs — simulates fetch+reset advancing HEAD. */
  syncedHead?: string;
}

export class MockGitClient implements GitClient {
  public cloned: { repo: RepoRef; url: string }[] = [];
  public syncs: { repo: RepoRef; branch: string }[] = [];
  private syncedHead?: string;

  constructor(private opts: MockGitOptions = {}) {}

  clonePathFor(repo: RepoRef): string {
    return `/mock/clones/${repo.owner}/${repo.name}`;
  }
  async clone(repo: RepoRef, url: string, _opts?: CloneOptions): Promise<{ path: string }> {
    this.cloned.push({ repo, url });
    return { path: this.clonePathFor(repo) };
  }
  async fetchPullHead(): Promise<void> {}
  async sync(repo: RepoRef, branch: string): Promise<{ head: string }> {
    this.syncs.push({ repo, branch });
    // After a sync, HEAD advances to syncedHead (or stays at head if unset).
    this.syncedHead = this.opts.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
    return { head: this.syncedHead };
  }
  async currentHead(): Promise<string> {
    return this.syncedHead ?? this.opts.head ?? 'a1b2c3d4';
  }
  async diffNameOnly(): Promise<string[]> {
    return this.opts.diffNameOnly ?? [];
  }
  async diff(): Promise<UnifiedDiff> {
    const raw =
      this.opts.diff ??
      'diff --git a/src/config.ts b/src/config.ts\n--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,';
    return parseUnifiedDiff(raw);
  }
  async blame(): Promise<BlameLine[]> {
    return [{ line: 1, sha: 'a1b2c3d4', author: 'marisa.koch', date: '2026-06-01', summary: 'init' }];
  }
  async log(): Promise<GitCommit[]> {
    return [{ sha: 'a1b2c3d4', message: 'init', author: 'marisa.koch', date: '2026-06-01' }];
  }
  async readFile(_repo: RepoRef, path: string): Promise<string> {
    return this.opts.files?.[path] ?? '';
  }
}

// ---------- Mock CodeIndex ----------
export class MockCodeIndex implements CodeIndex {
  async grep(_repo: RepoRef, pattern: string): Promise<CodeMatch[]> {
    return [{ path: 'src/config.ts', line: 12, text: `match for ${pattern}` }];
  }
  async symbols(): Promise<CodeSymbol[]> {
    return [{ path: 'src/middleware/ratelimit.ts', name: 'rateLimit', kind: 'function', line: 25 }];
  }
  async references(_repo: RepoRef, symbol: string): Promise<CodeReference[]> {
    return [{ fromPath: 'src/api/public/index.ts', toSymbol: symbol, line: 23 }];
  }
}

// ---------- Mock Auth / Secrets ----------
export class MockAuthProvider implements AuthProvider {
  constructor(
    private user: AuthUser = { id: 'u1', email: 'you@local', name: 'You' },
    private workspace: AuthWorkspace = { id: 'w1', name: 'default' },
  ) {}
  async currentUser(): Promise<AuthUser> {
    return this.user;
  }
  async currentWorkspace(): Promise<AuthWorkspace> {
    return this.workspace;
  }
}

export class MockSecretsProvider implements SecretsProvider {
  constructor(private secrets: Partial<Record<string, string>> = {}) {}
  async get(key: SecretKey): Promise<string | undefined> {
    return this.secrets[key as string];
  }
}


/**
 * In-memory `ContextDocStore`. Seed repository documents with `setRepoDoc`
 * (a repo counts as cloned once it has a doc or `setCloned(repoId, true)`),
 * local documents go through the same `writeLocal` API as the real store.
 */
export class MockContextDocStore implements ContextDocStore {
  private repoDocs = new Map<string, Map<string, string>>();
  private localDocs = new Map<string, Map<string, string>>();
  private localFolders = new Map<string, Set<string>>();
  private cloned = new Set<string>();
  /** repoId → (path → repository-text version recorded for an override copy). */
  private origins = new Map<string, Map<string, string>>();
  private readonly matches: (p: string) => boolean;
  private readonly roots: string[];

  constructor(globs: string[] = DEFAULT_CONTEXT_GLOBS) {
    this.matches = compileGlobs(globs);
    this.roots = searchRoots(globs);
  }

  setCloned(repoId: string, cloned: boolean): void {
    if (cloned) this.cloned.add(repoId);
    else this.cloned.delete(repoId);
  }

  setRepoDoc(repoId: string, path: string, content: string): void {
    this.cloned.add(repoId);
    const m = this.repoDocs.get(repoId) ?? new Map<string, string>();
    m.set(path, content);
    this.repoDocs.set(repoId, m);
  }

  private static version(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private originsOf(repoId: string): Map<string, string> {
    const m = this.origins.get(repoId) ?? new Map<string, string>();
    this.origins.set(repoId, m);
    return m;
  }

  private entry(
    path: string,
    content: string,
    source: ContextDocSource,
    marks: { overrides_repo: boolean; overridden: boolean; repo_changed: boolean },
  ): ContextDocEntry {
    const size = Buffer.byteLength(content);
    const tooLarge = size > CONTEXT_DOC_MAX_BYTES;
    const slash = path.lastIndexOf('/');
    return {
      path,
      source,
      type: docTypeOf(path),
      folder: slash === -1 ? '' : path.slice(0, slash),
      size_bytes: size,
      tokens: tooLarge ? null : Math.ceil(content.length / 4),
      too_large: tooLarge,
      ...marks,
    };
  }

  async list(scope: ContextDocScope): Promise<ContextDocListResult> {
    const repo = this.repoDocs.get(scope.repoId) ?? new Map<string, string>();
    const local = this.localDocs.get(scope.repoId) ?? new Map<string, string>();
    const cloned = this.cloned.has(scope.repoId);
    const repoHas = (p: string): boolean => cloned && repo.has(p) && this.matches(p);
    const origins = this.originsOf(scope.repoId);
    const repoChanged = (p: string, localHas: boolean): boolean => {
      if (!localHas || !repoHas(p)) return false;
      const version = MockContextDocStore.version(repo.get(p)!);
      const origin = origins.get(p);
      if (origin === undefined) {
        origins.set(p, version);
        return false;
      }
      return origin !== version;
    };
    if (cloned) for (const p of [...origins.keys()]) if (local.has(p) && !repo.has(p)) origins.delete(p);
    const docs = [
      ...[...repo]
        .filter(([p]) => this.matches(p))
        .map(([p, c]) =>
          this.entry(p, c, 'repo', { overrides_repo: false, overridden: cloned && local.has(p), repo_changed: false }),
        ),
      ...[...local].map(([p, c]) =>
        this.entry(p, c, 'local', {
          overrides_repo: repoHas(p),
          overridden: false,
          repo_changed: repoChanged(p, true),
        }),
      ),
    ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.source === 'repo' ? -1 : 1));
    return {
      state: cloned ? 'ok' : 'not_cloned',
      docs: docs.slice(0, 1000),
      local_folders: [...(this.localFolders.get(scope.repoId) ?? [])].sort(),
      truncated: docs.length > 1000,
    };
  }

  async read(scope: ContextDocScope, path: string, source?: ContextDocSource): Promise<ContextDocContent> {
    if (source === undefined) {
      const { overrides_repo: _overrides, ...doc } = await this.readEffective(scope, path);
      return doc;
    }
    if (!this.matches(path)) throw new ContextDocError('invalid_path');
    const cloned = this.cloned.has(scope.repoId);
    const text =
      source === 'local' ? this.localDocs.get(scope.repoId)?.get(path) : cloned ? this.repoDocs.get(scope.repoId)?.get(path) : undefined;
    if (text === undefined) {
      throw new ContextDocError(source === 'repo' && !cloned ? 'not_cloned' : 'not_found', { path });
    }
    return this.content(path, source, text);
  }

  private content(path: string, source: ContextDocSource, text: string): ContextDocContent {
    const size = Buffer.byteLength(text);
    if (size > CONTEXT_DOC_MAX_BYTES) throw new ContextDocError('too_large', { path });
    return { path, source, content: text, version: MockContextDocStore.version(text), size_bytes: size };
  }

  async readEffective(scope: ContextDocScope, path: string): Promise<EffectiveContextDoc> {
    if (!this.matches(path)) throw new ContextDocError('invalid_path');
    const cloned = this.cloned.has(scope.repoId);
    const repoText = cloned ? this.repoDocs.get(scope.repoId)?.get(path) : undefined;
    const localText = this.localDocs.get(scope.repoId)?.get(path);
    if (localText !== undefined) {
      const doc = this.content(path, 'local', localText);
      if (repoText !== undefined) {
        const origins = this.originsOf(scope.repoId);
        if (!origins.has(path)) origins.set(path, MockContextDocStore.version(repoText));
      }
      return { ...doc, overrides_repo: repoText !== undefined };
    }
    if (repoText === undefined) throw new ContextDocError(cloned ? 'not_found' : 'not_cloned', { path });
    return { ...this.content(path, 'repo', repoText), overrides_repo: false };
  }

  async keepOrigin(scope: ContextDocScope, path: string): Promise<void> {
    if (!this.matches(path)) throw new ContextDocError('invalid_path');
    if (!this.localDocs.get(scope.repoId)?.has(path)) throw new ContextDocError('not_found', { path });
    if (!this.cloned.has(scope.repoId)) throw new ContextDocError('not_cloned');
    const repoText = this.repoDocs.get(scope.repoId)?.get(path);
    if (repoText === undefined) throw new ContextDocError('not_found', { path });
    this.originsOf(scope.repoId).set(path, MockContextDocStore.version(repoText));
  }

  async writeLocal(scope: ContextDocScope, input: LocalDocWrite): Promise<ContextDocContent> {
    const path = input.folder ? `${input.folder}/${input.name}` : input.name;
    if (!input.name.endsWith('.md') || !this.matches(path)) throw new ContextDocError('invalid_path', { path });
    const size = Buffer.byteLength(input.content);
    if (size > CONTEXT_DOC_MAX_BYTES) throw new ContextDocError('too_large', { path });
    const local = this.localDocs.get(scope.repoId) ?? new Map<string, string>();
    const existing = local.get(path);
    let originVersion: string | undefined;
    if (input.baseVersion === undefined) {
      if (existing !== undefined) throw new ContextDocError('conflict', { path });
      const repoHas = this.cloned.has(scope.repoId) && this.repoDocs.get(scope.repoId)?.has(path);
      if (repoHas) {
        if (!input.override) throw new ContextDocError('conflict', { path });
        originVersion = input.override.originVersion;
      }
    } else {
      if (existing === undefined) throw new ContextDocError('not_found', { path });
      const cur = MockContextDocStore.version(existing);
      if (cur !== input.baseVersion) {
        throw new ContextDocError('stale', { path, currentContent: existing, currentVersion: cur });
      }
    }
    local.set(path, input.content);
    this.localDocs.set(scope.repoId, local);
    if (originVersion !== undefined) this.originsOf(scope.repoId).set(path, originVersion);
    return {
      path,
      source: 'local',
      content: input.content,
      version: MockContextDocStore.version(input.content),
      size_bytes: size,
    };
  }

  async createLocalFolder(scope: ContextDocScope, path: string): Promise<string> {
    if (!this.matches(`${path}/x.md`)) throw new ContextDocError('invalid_path', { path });
    const set = this.localFolders.get(scope.repoId) ?? new Set<string>();
    set.add(path);
    this.localFolders.set(scope.repoId, set);
    return path;
  }

  async deleteLocal(scope: ContextDocScope, path: string): Promise<void> {
    if (!this.localDocs.get(scope.repoId)?.delete(path)) throw new ContextDocError('not_found', { path });
    this.origins.get(scope.repoId)?.delete(path);
  }

  async deleteLocalFolder(scope: ContextDocScope, path: string): Promise<void> {
    const docs = [...(this.localDocs.get(scope.repoId)?.keys() ?? [])];
    if (docs.some((p) => p.startsWith(`${path}/`))) throw new ContextDocError('not_empty', { path });
    if (!this.localFolders.get(scope.repoId)?.delete(path)) throw new ContextDocError('not_found', { path });
  }

  async countLocal(repoId: string): Promise<number> {
    return this.localDocs.get(repoId)?.size ?? 0;
  }

  async removeRepoLocal(repoId: string): Promise<void> {
    this.localDocs.delete(repoId);
    this.localFolders.delete(repoId);
    this.origins.delete(repoId);
  }

  matchesGlobs(path: string): boolean {
    return this.matches(path);
  }

  searchRoots(): string[] {
    return [...this.roots];
  }
}
