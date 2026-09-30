import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import type { DevDigestApi } from '../api/client.js';
import { parsePrRef, parseRepoRef, type PrRef, type RepoRef } from './identifiers.js';

/** The identifier string didn't match any recognised PR/repo shape. */
export class UnparseableIdentifierError extends Error {
  constructor(kind: 'PR' | 'repository', public readonly input: string) {
    super(
      kind === 'PR'
        ? `Could not parse PR '${input}'. Use owner/repo#123 or https://github.com/owner/repo/pull/123.`
        : `Could not parse repository '${input}'. Use owner/repo or https://github.com/owner/repo.`,
    );
    this.name = 'UnparseableIdentifierError';
  }
}

/** No repo in the workspace matches; carries the imported list for the hint. */
export class RepoNotImportedError extends Error {
  constructor(public readonly ref: string, public readonly imported: string[]) {
    super(`Repository ${ref} is not imported in DevDigest.`);
    this.name = 'RepoNotImportedError';
  }
}

export class AmbiguousRepoError extends Error {
  constructor(name: string, public readonly matches: string[]) {
    super(`Repository name '${name}' matches more than one imported repo: ${matches.join(', ')}.`);
    this.name = 'AmbiguousRepoError';
  }
}

/** A bare PR number was given but zero or more than one repo is imported. */
export class AmbiguousPrNumberError extends Error {
  constructor(public readonly repoCount: number) {
    super(
      repoCount === 0
        ? 'No repository is imported yet — a bare PR number has nothing to resolve against.'
        : `A bare PR number is ambiguous with ${repoCount} repos imported. Use owner/repo#N.`,
    );
    this.name = 'AmbiguousPrNumberError';
  }
}

export class PrNotImportedError extends Error {
  constructor(public readonly ref: string) {
    super(`PR ${ref} is not in DevDigest.`);
    this.name = 'PrNotImportedError';
  }
}

export class UnknownAgentError extends Error {
  constructor(public readonly input: string, public readonly available: string[]) {
    super(`Unknown agent '${input}'. Available: ${available.join(', ')}.`);
    this.name = 'UnknownAgentError';
  }
}

export class AmbiguousAgentError extends Error {
  constructor(public readonly input: string, public readonly matches: { id: string; name: string }[]) {
    super(
      `Agent name '${input}' is ambiguous: ${matches.map((m) => `${m.name} (${m.id})`).join(', ')}.`,
    );
    this.name = 'AmbiguousAgentError';
  }
}

export interface ResolvedRepo {
  id: string;
  owner: string;
  name: string;
  fullName: string;
}

function toResolvedRepo(repo: Repo): ResolvedRepo {
  return { id: repo.id, owner: repo.owner, name: repo.name, fullName: repo.full_name };
}

/** Resolve `owner/repo` (or a unique bare name) against `GET /repos`. */
export async function resolveRepo(api: DevDigestApi, input: string): Promise<ResolvedRepo> {
  const ref = parseRepoRef(input);
  if (!ref) throw new UnparseableIdentifierError('repository', input);
  return resolveRepoRef(api, ref, input);
}

async function resolveRepoRef(api: DevDigestApi, ref: RepoRef, rawInput: string): Promise<ResolvedRepo> {
  const repos = await api.listRepos();
  if (ref.kind === 'owner-name') {
    const wanted = `${ref.owner}/${ref.name}`.toLowerCase();
    const match = repos.find((r) => r.full_name.toLowerCase() === wanted);
    if (!match) throw new RepoNotImportedError(rawInput, repos.map((r) => r.full_name).slice(0, 10));
    return toResolvedRepo(match);
  }
  const matches = repos.filter((r) => r.name.toLowerCase() === ref.name.toLowerCase());
  if (matches.length === 0) {
    throw new RepoNotImportedError(rawInput, repos.map((r) => r.full_name).slice(0, 10));
  }
  if (matches.length > 1) {
    throw new AmbiguousRepoError(ref.name, matches.map((r) => r.full_name));
  }
  return toResolvedRepo(matches[0]!);
}

export interface ResolvedPull {
  /** `null` only for the undocumented bare-uuid input, which has no route
   * back to its repo — tools then render the PR by its bare id. */
  repo: ResolvedRepo | null;
  pr: PrMeta;
}

export interface ResolvePullOptions {
  /** run_review only (Q3): sync once via `GET /repos/:id/pulls` and retry. */
  syncIfMissing?: boolean;
}

/** Resolve a PR reference to its repo + `PrMeta`. */
export async function resolvePull(
  api: DevDigestApi,
  input: string,
  opts: ResolvePullOptions = {},
): Promise<ResolvedPull> {
  const ref = parsePrRef(input);
  if (!ref) throw new UnparseableIdentifierError('PR', input);
  if (ref.kind === 'uuid') {
    const pr = await api.getPullById(ref.id);
    if (!pr) throw new PrNotImportedError(input);
    return { repo: null, pr };
  }

  let repo: ResolvedRepo;
  if (ref.kind === 'owner-repo-number') {
    repo = await resolveRepoRef(api, { kind: 'owner-name', owner: ref.owner, name: ref.name }, input);
  } else {
    const repos = await api.listRepos();
    if (repos.length !== 1) throw new AmbiguousPrNumberError(repos.length);
    repo = toResolvedRepo(repos[0]!);
  }

  const number = ref.number;
  let pr = await api.lookupPull(repo.id, number);
  if (!pr && opts.syncIfMissing) {
    await api.syncPulls(repo.id);
    pr = await api.lookupPull(repo.id, number);
  }
  if (!pr) throw new PrNotImportedError(input);
  return { repo, pr };
}

export interface ResolvedAgent {
  id: string;
  name: string;
  enabled: boolean;
}

/** Case-insensitive exact name, or an id. Two agents sharing a name → ambiguous. */
export function resolveAgent(agents: Agent[], input: string): ResolvedAgent {
  const byId = agents.find((a) => a.id === input);
  if (byId) return { id: byId.id, name: byId.name, enabled: byId.enabled };

  const matches = agents.filter((a) => a.name.toLowerCase() === input.toLowerCase());
  if (matches.length === 0) {
    throw new UnknownAgentError(input, agents.map((a) => a.name));
  }
  if (matches.length > 1) {
    throw new AmbiguousAgentError(input, matches.map((a) => ({ id: a.id, name: a.name })));
  }
  const m = matches[0]!;
  return { id: m.id, name: m.name, enabled: m.enabled };
}
