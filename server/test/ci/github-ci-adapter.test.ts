import { describe, it, expect, vi } from 'vitest';
import type { Octokit } from 'octokit';
import { OctokitGitHubClient } from '../../src/adapters/github/octokit.js';
import { ExternalServiceError, GitHubPermissionError } from '../../src/platform/errors.js';

/**
 * T-25 — Octokit adapter for export-to-ci, driven through an injected fake Octokit
 * (no network): commit parenting (AC-30…AC-32), blobs for 0-byte files, read
 * helpers used by the collector, and error mapping that never leaks the token
 * (AC-34, NFR-1). Statuses 403/404/422 only: the adapter retries 429/5xx with backoff.
 */
const FAKE_TOKEN = 'ghp_FAKE0123456789abcdefghijklmnopqrstuv';
const repo = { owner: 'acme', name: 'web' };

/** A failure shaped like Octokit's RequestError, including the headers that hold the token. */
const requestError = (status: number, message: string) =>
  Object.assign(new Error(message), {
    status,
    request: { method: 'POST', url: 'https://api.github.com/x', headers: { authorization: `token ${FAKE_TOKEN}` } },
    response: { status, headers: { 'x-ratelimit-remaining': '0' } },
  });

interface Calls {
  getRef: string[];
  blobs: Array<{ content: string; encoding: string }>;
  tree: Array<{ base_tree: string; tree: Array<Record<string, unknown>> }>;
  commits: Array<{ parents: string[]; tree: string; message: string }>;
  createRef: Array<{ ref: string; sha: string }>;
  updateRef: Array<{ ref: string; sha: string; force?: boolean }>;
}

function fakeOctokit(opts: { existingBranches?: Record<string, string>; failOn?: Partial<Record<keyof Calls | 'createBlob', Error>> } = {}) {
  const heads: Record<string, string> = { main: 'base-head-sha', ...opts.existingBranches };
  const calls: Calls = { getRef: [], blobs: [], tree: [], commits: [], createRef: [], updateRef: [] };
  const git = {
    getRef: vi.fn(async ({ ref }: { ref: string }) => {
      calls.getRef.push(ref);
      const sha = heads[ref.replace('heads/', '')];
      if (!sha) throw requestError(404, 'Not Found');
      return { data: { object: { sha } } };
    }),
    createBlob: vi.fn(async (p: { content: string; encoding: string }) => {
      if (opts.failOn?.createBlob) throw opts.failOn.createBlob;
      calls.blobs.push({ content: p.content, encoding: p.encoding });
      return { data: { sha: `blob-${calls.blobs.length}` } };
    }),
    getCommit: vi.fn(async ({ commit_sha }: { commit_sha: string }) => ({ data: { tree: { sha: `tree-of-${commit_sha}` } } })),
    createTree: vi.fn(async (p: { base_tree: string; tree: Array<Record<string, unknown>> }) => {
      calls.tree.push({ base_tree: p.base_tree, tree: p.tree });
      return { data: { sha: 'new-tree' } };
    }),
    createCommit: vi.fn(async (p: { parents: string[]; tree: string; message: string }) => {
      calls.commits.push({ parents: p.parents, tree: p.tree, message: p.message });
      return { data: { sha: 'new-commit' } };
    }),
    createRef: vi.fn(async (p: { ref: string; sha: string }) => {
      calls.createRef.push({ ref: p.ref, sha: p.sha });
      return {};
    }),
    updateRef: vi.fn(async (p: { ref: string; sha: string; force?: boolean }) => {
      calls.updateRef.push({ ref: p.ref, sha: p.sha, force: p.force });
      return {};
    }),
  };
  const other: Record<string, any> = {
    pulls: { create: vi.fn(), list: vi.fn(), get: vi.fn() },
    repos: { get: vi.fn(), getContent: vi.fn() },
    actions: { listRepoSecrets: 'listRepoSecrets', listWorkflowRuns: 'listWorkflowRuns', listWorkflowRunArtifacts: vi.fn(), downloadArtifact: vi.fn() },
  };
  const paginate = vi.fn();
  const octokit = { rest: { git, ...other }, paginate } as unknown as Octokit;
  return { octokit, calls, other, paginate, client: new OctokitGitHubClient(FAKE_TOKEN, octokit) };
}

const files = [
  { path: '.devdigest/agents/a.yaml', contents: 'name: a\n' },
  { path: '.devdigest/memory.jsonl', contents: '' },
];

describe('commitFiles', () => {
  it('creates a blob per file (0-byte file included) and references blobs by sha in the tree; new branch is parented on base (AC-30)', async () => {
    const { client, calls } = fakeOctokit();
    await client.commitFiles(repo, { branch: 'devdigest/ci', base: 'main', message: 'm', files });

    expect(calls.blobs).toEqual([
      { content: 'name: a\n', encoding: 'utf-8' },
      { content: '', encoding: 'utf-8' },
    ]);
    expect(calls.tree).toHaveLength(1);
    expect(calls.tree[0]!.tree).toEqual([
      { path: '.devdigest/agents/a.yaml', mode: '100644', type: 'blob', sha: 'blob-1' },
      { path: '.devdigest/memory.jsonl', mode: '100644', type: 'blob', sha: 'blob-2' },
    ]);
    expect(calls.tree[0]!.tree.every((e) => !('content' in e))).toBe(true);
    expect(calls.commits).toEqual([{ parents: ['base-head-sha'], tree: 'new-tree', message: 'm' }]);
    expect(calls.createRef).toEqual([{ ref: 'refs/heads/devdigest/ci', sha: 'new-commit' }]);
    expect(calls.updateRef).toEqual([]);
  });

  it('layers on the existing branch head by default, keeping other agents\' files (AC-31)', async () => {
    const { client, calls } = fakeOctokit({ existingBranches: { 'devdigest/ci': 'branch-head-sha' } });
    await client.commitFiles(repo, { branch: 'devdigest/ci', base: 'main', message: 'm', files });

    expect(calls.commits[0]!.parents).toEqual(['branch-head-sha']);
    expect(calls.tree[0]!.base_tree).toBe('tree-of-branch-head-sha');
    expect(calls.updateRef).toEqual([{ ref: 'heads/devdigest/ci', sha: 'new-commit', force: true }]);
  });

  it('with fromBase re-parents a leftover branch on the head of base, so the PR holds only the exported paths (AC-32)', async () => {
    const { client, calls } = fakeOctokit({ existingBranches: { 'devdigest/ci': 'stale-branch-head' } });
    await client.commitFiles(repo, { branch: 'devdigest/ci', base: 'main', message: 'm', files, fromBase: true });

    expect(calls.commits[0]!.parents).toEqual(['base-head-sha']);
    expect(calls.tree[0]!.base_tree).toBe('tree-of-base-head-sha');
    expect(calls.updateRef).toEqual([{ ref: 'heads/devdigest/ci', sha: 'new-commit', force: true }]);
    expect(calls.createRef).toEqual([]);
  });

  it('never touches a branch other than the target (AC-30)', async () => {
    const { client, calls } = fakeOctokit();
    await client.commitFiles(repo, { branch: 'devdigest/ci', base: 'main', message: 'm', files });
    expect([...calls.createRef.map((c) => c.ref), ...calls.updateRef.map((c) => c.ref)].every((r) => r.endsWith('devdigest/ci'))).toBe(true);
  });
});

describe('error mapping (AC-34, NFR-1)', () => {
  it('maps a GitHub failure to ExternalServiceError carrying only GitHub\'s message and status, never the token or headers', async () => {
    const { client } = fakeOctokit({ failOn: { createBlob: requestError(403, 'Resource not accessible by personal access token') } });
    const err = await client
      .commitFiles(repo, { branch: 'devdigest/ci', base: 'main', message: 'm', files })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ExternalServiceError);
    const e = err as ExternalServiceError;
    expect(e.message).toBe('Resource not accessible by personal access token');
    expect(e.details).toEqual({ status: 403 });
    const dump = JSON.stringify({ message: e.message, details: e.details, code: e.code }) + String(e.stack);
    expect(dump).not.toContain(FAKE_TOKEN);
    expect(dump).not.toContain('authorization');
    expect(Object.keys(e)).not.toContain('request');
    expect(Object.keys(e)).not.toContain('response');
  });

  it('maps a 403/404 on the Actions secret names to GitHubPermissionError, so the service can answer "unknown" (AC-26)', async () => {
    for (const status of [403, 404]) {
      const { client, paginate } = fakeOctokit();
      paginate.mockRejectedValueOnce(requestError(status, 'nope'));
      await expect(client.listActionsSecretNames(repo)).rejects.toBeInstanceOf(GitHubPermissionError);
    }
  });

  it('reads secret names only', async () => {
    const { client, paginate } = fakeOctokit();
    paginate.mockResolvedValueOnce([
      { name: 'OPENROUTER_API_KEY', created_at: 'x', value: 'must-not-surface' },
      { name: 'OTHER', created_at: 'y' },
    ]);
    expect(await client.listActionsSecretNames(repo)).toEqual(['OPENROUTER_API_KEY', 'OTHER']);
  });
});

describe('PR and ingest reads', () => {
  it('openPullRequest and findOpenPr return the PR number with the URL', async () => {
    const { client, other } = fakeOctokit();
    other.pulls.create.mockResolvedValueOnce({ data: { html_url: 'https://github.com/acme/web/pull/7', number: 7 } });
    other.pulls.list.mockResolvedValueOnce({ data: [{ html_url: 'https://github.com/acme/web/pull/7', number: 7 }] });
    expect(await client.openPullRequest(repo, { title: 't', head: 'devdigest/ci', base: 'main', body: 'b' })).toEqual({
      url: 'https://github.com/acme/web/pull/7',
      number: 7,
    });
    expect(await client.findOpenPr(repo, 'devdigest/ci')).toEqual({ url: 'https://github.com/acme/web/pull/7', number: 7 });
  });

  it('listWorkflowRuns asks for completed pull_request runs of the workflow file since the watermark and maps the fields', async () => {
    const { client, paginate } = fakeOctokit();
    paginate.mockResolvedValueOnce([
      { id: 11, run_attempt: 2, conclusion: 'failure', head_sha: 'abc', html_url: 'https://github.com/acme/web/actions/runs/11', path: '.github/workflows/devdigest-review-a.yml', created_at: '2026-01-02T00:00:00Z', pull_requests: [{ number: 5 }] },
      { id: 12, run_attempt: null, conclusion: null, head_sha: 'def', html_url: 'https://github.com/acme/web/actions/runs/12', path: '.github/workflows/devdigest-review-a.yml', created_at: '2026-01-03T00:00:00Z', pull_requests: [] },
    ]);
    const runs = await client.listWorkflowRuns(repo, { workflowPath: '.github/workflows/devdigest-review-a.yml', since: '2026-01-01T00:00:00Z' });

    expect(paginate.mock.calls[0]![1]).toMatchObject({
      owner: 'acme',
      repo: 'web',
      workflow_id: 'devdigest-review-a.yml',
      event: 'pull_request',
      status: 'completed',
      created: '>=2026-01-01T00:00:00Z',
    });
    expect(runs).toEqual([
      { id: 11, run_attempt: 2, conclusion: 'failure', head_sha: 'abc', html_url: 'https://github.com/acme/web/actions/runs/11', path: '.github/workflows/devdigest-review-a.yml', created_at: '2026-01-02T00:00:00Z', pull_request_number: 5 },
      { id: 12, run_attempt: 1, conclusion: null, head_sha: 'def', html_url: 'https://github.com/acme/web/actions/runs/12', path: '.github/workflows/devdigest-review-a.yml', created_at: '2026-01-03T00:00:00Z', pull_request_number: null },
    ]);
  });

  it('fileExistsOnBranch maps 404 to false; getPullRequestState tells merged from closed (AC-40)', async () => {
    const { client, other } = fakeOctokit();
    other.repos.getContent.mockRejectedValueOnce(requestError(404, 'Not Found'));
    expect(await client.fileExistsOnBranch(repo, '.github/workflows/x.yml', 'main')).toBe(false);
    other.repos.getContent.mockResolvedValueOnce({ data: {} });
    expect(await client.fileExistsOnBranch(repo, '.github/workflows/x.yml', 'main')).toBe(true);

    other.pulls.get.mockResolvedValueOnce({ data: { state: 'closed', merged_at: '2026-01-01T00:00:00Z' } });
    expect(await client.getPullRequestState(repo, 7)).toBe('merged');
    other.pulls.get.mockResolvedValueOnce({ data: { state: 'closed', merged_at: null } });
    expect(await client.getPullRequestState(repo, 7)).toBe('closed');
  });
});
