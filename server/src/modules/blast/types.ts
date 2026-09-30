import type { PrBlastRadiusResponse } from '@devdigest/shared';
import type { RepoIntel } from '../repo-intel/types.js';

/** The pull as the blast service needs it: identity, head SHA, changed file paths. */
export interface BlastPullContext {
  prId: string;
  repoId: string;
  headSha: string;
  files: string[];
}

export interface BlastRepositoryPort {
  /** Workspace-scoped; `undefined` when the pull does not exist. */
  getPullContext(workspaceId: string, prId: string): Promise<BlastPullContext | undefined>;
}

/** Minimal structured logger (same shape as the intent module's). */
export interface BlastLog {
  info(msg: string, data?: unknown): void;
}

/** What routes reach through `container.blast`. */
export interface BlastFacade {
  getForPull(workspaceId: string, prId: string, log?: BlastLog): Promise<PrBlastRadiusResponse>;
}

/** Deliberately no LLM and no GitHub dependency: the map is read from the index only. */
export interface BlastServiceDeps {
  repo: BlastRepositoryPort;
  repoIntel: Pick<RepoIntel, 'getIndexState' | 'getBlastRadius'>;
  repoIntelEnabled: boolean;
}
