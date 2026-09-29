import { describe, it, expect, vi } from 'vitest';
import {
  resolveRepo,
  resolvePull,
  resolveAgent,
  RepoNotImportedError,
  AmbiguousRepoError,
  AmbiguousPrNumberError,
  PrNotImportedError,
  UnknownAgentError,
  AmbiguousAgentError,
  UnparseableIdentifierError,
} from '../src/resolve/resolvers.js';
import type { DevDigestApi } from '../src/api/client.js';
import type { Agent, PrMeta, Repo } from '@devdigest/shared';

const REPO: Repo = {
  id: 'repo-1',
  workspace_id: 'ws-1',
  owner: 'acme',
  name: 'payments-api',
  full_name: 'acme/payments-api',
  default_branch: 'main',
  clone_path: null,
  last_polled_at: null,
  created_by: null,
};

const PR: PrMeta = {
  id: 'pr-1',
  number: 482,
  title: 'Add rate limiting',
  author: 'marisa.koch',
  branch: 'feat/rate-limit',
  base: 'main',
  head_sha: 'abc123',
  additions: 10,
  deletions: 2,
  files_count: 3,
  status: 'needs_review',
};

function fakeApi(overrides: Partial<DevDigestApi> = {}): DevDigestApi {
  return {
    listRepos: vi.fn(async () => [REPO]),
    lookupPull: vi.fn(async () => PR),
    syncPulls: vi.fn(async () => [PR]),
    getPullById: vi.fn(async () => null),
    ...overrides,
  } as unknown as DevDigestApi;
}

describe('resolveRepo', () => {
  it('resolves owner/repo by exact full_name match', async () => {
    const api = fakeApi();
    const repo = await resolveRepo(api, 'acme/payments-api');
    expect(repo.id).toBe('repo-1');
  });

  it('throws RepoNotImportedError with an imported list when unmatched', async () => {
    const api = fakeApi();
    await expect(resolveRepo(api, 'other/repo')).rejects.toBeInstanceOf(RepoNotImportedError);
  });

  it('throws AmbiguousRepoError when a bare name matches two repos', async () => {
    const api = fakeApi({
      listRepos: vi.fn(async () => [REPO, { ...REPO, id: 'repo-2', owner: 'other', full_name: 'other/payments-api' }]),
    });
    await expect(resolveRepo(api, 'payments-api')).rejects.toBeInstanceOf(AmbiguousRepoError);
  });

  it('throws UnparseableIdentifierError for an empty string', async () => {
    const api = fakeApi();
    await expect(resolveRepo(api, '')).rejects.toBeInstanceOf(UnparseableIdentifierError);
  });
});

describe('resolvePull', () => {
  it('resolves owner/repo#N to its repo + PrMeta', async () => {
    const api = fakeApi();
    const { repo, pr } = await resolvePull(api, 'acme/payments-api#482');
    expect(repo?.id).toBe('repo-1');
    expect(pr.number).toBe(482);
  });

  it('resolves a bare number only when exactly one repo is imported', async () => {
    const api = fakeApi();
    const { pr } = await resolvePull(api, '482');
    expect(pr.number).toBe(482);
  });

  it('rejects a bare number when more than one repo is imported', async () => {
    const api = fakeApi({
      listRepos: vi.fn(async () => [REPO, { ...REPO, id: 'repo-2', full_name: 'acme/other' }]),
    });
    await expect(resolvePull(api, '482')).rejects.toBeInstanceOf(AmbiguousPrNumberError);
  });

  it('syncs once and retries when run_review opts in and the PR is missing', async () => {
    const lookupPull = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce(PR);
    const api = fakeApi({ lookupPull });
    const { pr } = await resolvePull(api, 'acme/payments-api#482', { syncIfMissing: true });
    expect(pr.number).toBe(482);
    expect(lookupPull).toHaveBeenCalledTimes(2);
  });

  it('throws PrNotImportedError when the PR is missing and no sync is requested', async () => {
    const api = fakeApi({ lookupPull: vi.fn(async () => null) });
    await expect(resolvePull(api, 'acme/payments-api#999')).rejects.toBeInstanceOf(PrNotImportedError);
  });

  it('passes a uuid straight through via getPullById', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const api = fakeApi({ getPullById: vi.fn(async () => ({ ...PR, id, body: null, files: [], commits: [] })) });
    const { repo, pr } = await resolvePull(api, id);
    expect(repo).toBeNull();
    expect(pr.id).toBe(id);
  });
});

const AGENTS: Agent[] = [
  {
    id: 'a1',
    name: 'General Reviewer',
    description: 'desc',
    provider: 'openrouter',
    model: 'x',
    system_prompt: 'p',
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
  {
    id: 'a2',
    name: 'Security Reviewer',
    description: 'desc',
    provider: 'openrouter',
    model: 'x',
    system_prompt: 'p',
    enabled: false,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
  },
];

describe('resolveAgent', () => {
  it('resolves by exact case-insensitive name', () => {
    const resolved = resolveAgent(AGENTS, 'general reviewer');
    expect(resolved.id).toBe('a1');
  });

  it('resolves by id', () => {
    const resolved = resolveAgent(AGENTS, 'a2');
    expect(resolved.name).toBe('Security Reviewer');
  });

  it('throws UnknownAgentError listing available names', async () => {
    expect(() => resolveAgent(AGENTS, 'nope')).toThrow(UnknownAgentError);
  });

  it('throws AmbiguousAgentError when two agents share a name', () => {
    const dup = [...AGENTS, { ...AGENTS[0]!, id: 'a3' }];
    expect(() => resolveAgent(dup, 'General Reviewer')).toThrow(AmbiguousAgentError);
  });
});
