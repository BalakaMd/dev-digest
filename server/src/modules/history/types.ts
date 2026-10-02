import type { GitHubClient, PrHistoryResponse, RepoRef } from '@devdigest/shared';

/** The pull as the history service needs it: identity, refs, repo and changed files. */
export interface HistoryPullContext {
  prId: string;
  repoId: string;
  number: number;
  /** The PR base branch, the ref whose history is read. */
  base: string;
  defaultBranch: string;
  repo: RepoRef;
  files: { path: string; additions: number; deletions: number }[];
}

export interface HistoryRepositoryPort {
  /** Workspace-scoped; `undefined` when the pull does not exist. */
  getPullContext(workspaceId: string, prId: string): Promise<HistoryPullContext | undefined>;
}

/** Minimal structured logger (same shape as the blast module's). */
export interface HistoryLog {
  info(msg: string, data?: unknown): void;
}

/** What routes reach through `container.history`. */
export interface HistoryFacade {
  getForPull(workspaceId: string, prId: string, log?: HistoryLog): Promise<PrHistoryResponse>;
}

/** No LLM dependency by design: the list is read from GitHub history and ranked deterministically. */
export interface HistoryServiceDeps {
  repo: HistoryRepositoryPort;
  github: () => Promise<Pick<GitHubClient, 'listPathPullHistory'>>;
  now: () => number;
}
