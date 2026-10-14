import { Octokit } from 'octokit';
import type {
  GitHubClient,
  RepoRef,
  PrMeta,
  PrDetail,
  PrStatus,
  GitHubReviewPayload,
  CreateReviewCommentInput,
  PrReviewComment,
  OpenPrPayload,
  CommitFilesPayload,
  IssueMeta,
  PathPullHistoryQuery,
  PathPullHistory,
  PrRef,
  WorkflowRunInfo,
  ListWorkflowRunsQuery,
  RunArtifactInfo,
} from '@devdigest/shared';
import { PATH_ALIASES_PER_QUERY, buildPathHistoryQuery, parsePathHistory } from './path-history.js';
import { withRetry, withTimeout } from '../../platform/resilience.js';
import { ExternalServiceError, GitHubPermissionError } from '../../platform/errors.js';

const TIMEOUT = 30_000;
const MAX_FILE_BYTES = 1_000_000;

function mapStatus(state: string, merged: boolean | undefined): PrStatus {
  if (merged) return 'merged';
  if (state === 'closed') return 'closed';
  return 'open';
}

/**
 * Map an Octokit failure to `ExternalServiceError` carrying GitHub's `message`
 * and HTTP status only — never request headers (they hold the token).
 * `permission` maps 403/404 to `GitHubPermissionError`.
 */
function mapGitHubError(err: unknown, opts: { permission?: boolean } = {}): never {
  if (err instanceof ExternalServiceError) throw err;
  const e = err as { status?: number; message?: unknown };
  const status = typeof e?.status === 'number' ? e.status : undefined;
  const message = typeof e?.message === 'string' ? e.message : 'GitHub request failed';
  const details = { status };
  if (opts.permission && (status === 403 || status === 404)) {
    throw new GitHubPermissionError(message, details);
  }
  throw new ExternalServiceError(message, details);
}

/**
 * GitHubClient over Octokit REST — thin. PAT auth (fine-grained).
 * Reads PR list/detail/files/commits/issue; posts reviews; opens PRs.
 * One GraphQL read: per-path pull-request history (`listPathPullHistory`).
 */
export class OctokitGitHubClient implements GitHubClient {
  private octokit: Octokit;

  /** `octokit` is injectable so tests can script GitHub without the network. */
  constructor(token: string, octokit?: Octokit) {
    this.octokit = octokit ?? new Octokit({ auth: token });
  }

  async listPullRequests(repo: RepoRef): Promise<PrMeta[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          // Fetch open + recently merged/closed (most-recently-updated first) so
          // the list shows which PRs are merged vs still open — not just open.
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'all',
            sort: 'updated',
            direction: 'desc',
            per_page: 50,
          });
          return res.data.map((pr) => ({
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: 0,
            deletions: 0,
            files_count: 0, // not present on the list payload; populated by getPullRequest
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
          }));
        })(),
        TIMEOUT,
      ),
    );
  }

  async getPullRequest(repo: RepoRef, n: number): Promise<PrDetail> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const { data: pr } = await this.octokit.rest.pulls.get({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
          });
          const { data: files } = await this.octokit.rest.pulls.listFiles({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const { data: commits } = await this.octokit.rest.pulls.listCommits({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          const linkedIssue = await this.resolveLinkedIssue(repo, pr.body ?? '');
          return {
            number: pr.number,
            title: pr.title,
            author: pr.user?.login ?? 'unknown',
            branch: pr.head.ref,
            base: pr.base.ref,
            head_sha: pr.head.sha,
            additions: pr.additions,
            deletions: pr.deletions,
            files_count: pr.changed_files,
            status: mapStatus(pr.state, Boolean(pr.merged_at)) as PrStatus,
            opened_at: pr.created_at,
            updated_at: pr.updated_at,
            body: pr.body,
            files: files.map((f) => ({
              path: f.filename,
              additions: f.additions,
              deletions: f.deletions,
              patch: f.patch,
            })),
            commits: commits.map((c) => ({
              sha: c.sha,
              message: c.commit.message,
              author: c.commit.author?.name ?? c.author?.login ?? 'unknown',
              committed_at: c.commit.author?.date,
            })),
            linked_issue: linkedIssue,
          };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** linked issue via regex on PR body (#123 / closes #123). */
  private async resolveLinkedIssue(repo: RepoRef, body: string): Promise<IssueMeta | undefined> {
    const m = body.match(/(?:closes|fixes|resolves)?\s*#(\d+)/i);
    if (!m?.[1]) return undefined;
    try {
      return await this.getIssue(repo, Number(m[1]));
    } catch {
      return undefined;
    }
  }

  async postReview(
    repo: RepoRef,
    n: number,
    review: GitHubReviewPayload,
  ): Promise<{ id: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.createReview({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            body: review.body,
            event: review.event,
            comments: review.comments?.map((c) => ({
              path: c.path,
              line: c.line,
              body: c.body,
            })),
          });
          return { id: String(res.data.id) };
        })(),
        TIMEOUT,
      ),
    );
  }

  /** Shape an Octokit review-comment payload into our DTO. */
  private mapReviewComment(c: {
    id: number;
    path: string;
    line?: number | null;
    original_line?: number | null;
    side?: string | null;
    body: string;
    user: { login: string } | null;
    created_at: string;
    html_url: string;
    in_reply_to_id?: number;
  }): PrReviewComment {
    return {
      id: c.id,
      path: c.path,
      line: c.line ?? null,
      original_line: c.original_line ?? null,
      side: c.side === 'LEFT' ? 'LEFT' : 'RIGHT',
      body: c.body,
      user: c.user?.login ?? 'unknown',
      created_at: c.created_at,
      html_url: c.html_url,
      in_reply_to_id: c.in_reply_to_id ?? null,
      // GitHub drops `line` when the comment can no longer be placed on the diff.
      is_outdated: c.line == null,
    };
  }

  async listReviewComments(repo: RepoRef, n: number): Promise<PrReviewComment[]> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.listReviewComments({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            per_page: 100,
          });
          return res.data.map((c) => this.mapReviewComment(c));
        })(),
        TIMEOUT,
      ),
    );
  }

  async createReviewComment(
    repo: RepoRef,
    n: number,
    input: CreateReviewCommentInput,
  ): Promise<PrReviewComment> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          if (input.inReplyTo != null) {
            const res = await this.octokit.rest.pulls.createReplyForReviewComment({
              owner: repo.owner,
              repo: repo.name,
              pull_number: n,
              comment_id: input.inReplyTo,
              body: input.body,
            });
            return this.mapReviewComment(res.data);
          }
          const res = await this.octokit.rest.pulls.createReviewComment({
            owner: repo.owner,
            repo: repo.name,
            pull_number: n,
            commit_id: input.commitId,
            path: input.path,
            line: input.line,
            side: input.side ?? 'RIGHT',
            body: input.body,
          });
          return this.mapReviewComment(res.data);
        })(),
        TIMEOUT,
      ),
    );
  }

  async openPullRequest(repo: RepoRef, payload: OpenPrPayload): Promise<PrRef> {
    return this.mapped(() => this.openPullRequestRaw(repo, payload));
  }

  private async openPullRequestRaw(repo: RepoRef, payload: OpenPrPayload): Promise<PrRef> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.create({
            owner: repo.owner,
            repo: repo.name,
            title: payload.title,
            head: payload.head,
            base: payload.base,
            body: payload.body,
          });
          return { url: res.data.html_url, number: res.data.number };
        })(),
        TIMEOUT,
      ),
    );
  }

  async commitFiles(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return this.mapped(() => this.commitFilesRaw(repo, payload));
  }

  private async commitFilesRaw(
    repo: RepoRef,
    payload: CommitFilesPayload,
  ): Promise<{ branch: string }> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const owner = repo.owner;
          const name = repo.name;
          const g = this.octokit.rest.git;

          // Parent commit: the target branch if it already exists, else the base.
          // `fromBase` re-parents an existing branch on the base head instead.
          let parentSha: string;
          let branchExists = false;
          try {
            const ref = await g.getRef({ owner, repo: name, ref: `heads/${payload.branch}` });
            parentSha = ref.data.object.sha;
            branchExists = true;
          } catch {
            const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
            parentSha = baseRef.data.object.sha;
          }
          if (branchExists && payload.fromBase) {
            const baseRef = await g.getRef({ owner, repo: name, ref: `heads/${payload.base}` });
            parentSha = baseRef.data.object.sha;
          }

          // Blobs first (a tree entry with empty `content` is rejected, which
          // breaks 0-byte files); the tree then references them by sha.
          const blobs = await Promise.all(
            payload.files.map(async (f) => {
              const blob = await g.createBlob({
                owner,
                repo: name,
                content: f.contents,
                encoding: 'utf-8',
              });
              return { path: f.path, sha: blob.data.sha };
            }),
          );

          // New tree layered on the parent's tree (so unrelated files are kept).
          const parentCommit = await g.getCommit({ owner, repo: name, commit_sha: parentSha });
          const tree = await g.createTree({
            owner,
            repo: name,
            base_tree: parentCommit.data.tree.sha,
            tree: blobs.map((b) => ({
              path: b.path,
              mode: '100644' as const,
              type: 'blob' as const,
              sha: b.sha,
            })),
          });

          const commit = await g.createCommit({
            owner,
            repo: name,
            message: payload.message,
            tree: tree.data.sha,
            parents: [parentSha],
          });

          if (branchExists) {
            await g.updateRef({
              owner,
              repo: name,
              ref: `heads/${payload.branch}`,
              sha: commit.data.sha,
              force: true,
            });
          } else {
            await g.createRef({
              owner,
              repo: name,
              ref: `refs/heads/${payload.branch}`,
              sha: commit.data.sha,
            });
          }
          return { branch: payload.branch };
        })(),
        TIMEOUT,
      ),
    );
  }

  async findOpenPr(repo: RepoRef, branch: string): Promise<PrRef | null> {
    return this.mapped(() => this.findOpenPrRaw(repo, branch));
  }

  private async findOpenPrRaw(repo: RepoRef, branch: string): Promise<PrRef | null> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.pulls.list({
            owner: repo.owner,
            repo: repo.name,
            state: 'open',
            head: `${repo.owner}:${branch}`,
            per_page: 1,
          });
          const pr = res.data[0];
          return pr ? { url: pr.html_url, number: pr.number } : null;
        })(),
        TIMEOUT,
      ),
    );
  }

  async getDefaultBranch(repo: RepoRef): Promise<string> {
    return this.call(async () => {
      const res = await this.octokit.rest.repos.get({ owner: repo.owner, repo: repo.name });
      return res.data.default_branch;
    });
  }

  async listActionsSecretNames(repo: RepoRef): Promise<string[]> {
    return this.call(
      async () => {
        const items = await this.octokit.paginate(this.octokit.rest.actions.listRepoSecrets, {
          owner: repo.owner,
          repo: repo.name,
          per_page: 100,
        });
        return items.map((s) => s.name);
      },
      { permission: true },
    );
  }

  async listWorkflowRuns(repo: RepoRef, q: ListWorkflowRunsQuery): Promise<WorkflowRunInfo[]> {
    const workflowId = q.workflowPath.split('/').pop() ?? q.workflowPath;
    return this.call(async () => {
      const runs = await this.octokit.paginate(this.octokit.rest.actions.listWorkflowRuns, {
        owner: repo.owner,
        repo: repo.name,
        workflow_id: workflowId,
        event: 'pull_request',
        status: 'completed',
        created: `>=${q.since}`,
        per_page: 100,
      });
      return runs.map((r) => ({
        id: r.id,
        run_attempt: r.run_attempt ?? 1,
        conclusion: r.conclusion ?? null,
        head_sha: r.head_sha,
        html_url: r.html_url,
        path: r.path,
        created_at: r.created_at,
        pull_request_number: r.pull_requests?.[0]?.number ?? null,
      }));
    });
  }

  async findRunArtifact(
    repo: RepoRef,
    runId: number,
    name: string,
  ): Promise<RunArtifactInfo | null> {
    return this.call(async () => {
      const res = await this.octokit.rest.actions.listWorkflowRunArtifacts({
        owner: repo.owner,
        repo: repo.name,
        run_id: runId,
        name,
        per_page: 100,
      });
      const a = res.data.artifacts.find((x) => x.name === name);
      return a ? { id: a.id, size_bytes: a.size_in_bytes, expired: a.expired } : null;
    });
  }

  async downloadArtifact(repo: RepoRef, artifactId: number): Promise<Uint8Array> {
    return this.call(async () => {
      const res = await this.octokit.rest.actions.downloadArtifact({
        owner: repo.owner,
        repo: repo.name,
        artifact_id: artifactId,
        archive_format: 'zip',
      });
      return new Uint8Array(res.data as ArrayBuffer);
    });
  }

  async fileExistsOnBranch(repo: RepoRef, path: string, branch: string): Promise<boolean> {
    try {
      await withRetry(() =>
        withTimeout(
          this.octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path,
            ref: branch,
          }),
          TIMEOUT,
        ),
      );
      return true;
    } catch (err) {
      if ((err as { status?: number })?.status === 404) return false;
      return mapGitHubError(err);
    }
  }

  async getPullRequestState(repo: RepoRef, n: number): Promise<'open' | 'closed' | 'merged'> {
    return this.call(async () => {
      const res = await this.octokit.rest.pulls.get({
        owner: repo.owner,
        repo: repo.name,
        pull_number: n,
      });
      return mapStatus(res.data.state, Boolean(res.data.merged_at)) as 'open' | 'closed' | 'merged';
    });
  }

  /** Map failures of an already retried/timed-out call (no header leakage). */
  private async mapped<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (err) {
      return mapGitHubError(err);
    }
  }

  /** Retry + timeout wrapper that maps failures without leaking headers. */
  private async call<T>(fn: () => Promise<T>, opts: { permission?: boolean } = {}): Promise<T> {
    try {
      return await withRetry(() => withTimeout(fn(), TIMEOUT));
    } catch (err) {
      return mapGitHubError(err, opts);
    }
  }

  async getIssue(repo: RepoRef, n: number): Promise<IssueMeta> {
    const res = await withRetry(() =>
      withTimeout(
        this.octokit.rest.issues.get({ owner: repo.owner, repo: repo.name, issue_number: n }),
        TIMEOUT,
      ),
    );
    return {
      number: res.data.number,
      title: res.data.title,
      body: res.data.body,
      state: res.data.state,
    };
  }

  async getFileContent(repo: RepoRef, path: string, ref: string): Promise<string> {
    return withRetry(() =>
      withTimeout(
        (async () => {
          const res = await this.octokit.rest.repos.getContent({
            owner: repo.owner,
            repo: repo.name,
            path,
            ref,
          });
          const data = res.data;
          if (Array.isArray(data) || data.type !== 'file') {
            throw new Error(`${path} is not a regular file at ${ref}`);
          }
          if (data.size > MAX_FILE_BYTES) {
            throw new Error(`${path} is over ${MAX_FILE_BYTES} bytes at ${ref}`);
          }
          if (!data.content) {
            throw new Error(`${path} has no content at ${ref}`);
          }
          return Buffer.from(data.content, 'base64').toString('utf-8');
        })(),
        TIMEOUT,
      ),
    );
  }

  async listPathPullHistory(repo: RepoRef, q: PathPullHistoryQuery): Promise<PathPullHistory> {
    const clamp = (n: number) => Math.min(100, Math.max(1, Math.trunc(n)));
    const n = clamp(q.commitsPerPath);
    const m = clamp(q.pullsPerCommit);
    const result: PathPullHistory = { refFound: true, paths: [] };
    for (let i = 0; i < q.paths.length; i += PATH_ALIASES_PER_QUERY) {
      const chunk = q.paths.slice(i, i + PATH_ALIASES_PER_QUERY);
      const vars: Record<string, string | number> = {
        owner: repo.owner,
        name: repo.name,
        ref: q.ref,
        n,
        m,
      };
      chunk.forEach((path, j) => {
        vars[`p${j}`] = path;
      });
      const data = await withRetry(() =>
        withTimeout(this.octokit.graphql(buildPathHistoryQuery(chunk.length), vars), TIMEOUT),
      );
      const parsed = parsePathHistory(data, chunk);
      if (!parsed.refFound) result.refFound = false;
      result.paths.push(...parsed.paths);
    }
    return result;
  }

  async currentLogin(): Promise<string> {
    const res = await withRetry(() =>
      withTimeout(this.octokit.rest.users.getAuthenticated(), TIMEOUT),
    );
    return res.data.login;
  }
}
