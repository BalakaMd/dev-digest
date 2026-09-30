import type { PathPullHistory, PrHistoryResponse } from '@devdigest/shared';
import { ConfigError, NotFoundError } from '../../platform/errors.js';
import {
  HISTORY_CACHE_MAX_ENTRIES,
  HISTORY_CACHE_TTL_MS,
  HISTORY_COMMITS_PER_FILE,
  HISTORY_MAX_FILES,
  HISTORY_MAX_PRS,
  HISTORY_MAX_PR_CHANGED_FILES,
  HISTORY_PULLS_PER_COMMIT,
} from './constants.js';
import { pickHistoryFiles, selectPriorPrs } from './selection.js';
import type {
  HistoryFacade,
  HistoryLog,
  HistoryPullContext,
  HistoryServiceDeps,
} from './types.js';

type Degraded = NonNullable<PrHistoryResponse['degraded_reason']>;

const degraded = (reason: Degraded): PrHistoryResponse => ({
  history: [],
  degraded: true,
  degraded_reason: reason,
});

/**
 * Prior merged PRs that touched the same files, read from GitHub GraphQL and
 * ranked deterministically (no LLM). GitHub problems never fail the request:
 * they return `degraded` with a reason. Successful results are cached in
 * memory for `HISTORY_CACHE_TTL_MS`; degraded ones are not.
 */
export class HistoryService implements HistoryFacade {
  private cache = new Map<string, { storedAt: number; value: PrHistoryResponse }>();

  constructor(private deps: HistoryServiceDeps) {}

  async getForPull(workspaceId: string, prId: string, log?: HistoryLog): Promise<PrHistoryResponse> {
    const ctx = await this.deps.repo.getPullContext(workspaceId, prId);
    if (!ctx) throw new NotFoundError('Pull request not found');

    if (ctx.files.length === 0) return this.notAvailable(log, ctx, 'no_files');
    const paths = pickHistoryFiles(ctx.files, HISTORY_MAX_FILES);
    if (paths.length === 0) return { history: [], degraded: false, degraded_reason: null };

    const started = this.deps.now();
    const key = `${ctx.repoId}|${ctx.base}|${ctx.number}|${paths.join('\n')}`;
    const hit = this.cache.get(key);
    if (hit && started - hit.storedAt < HISTORY_CACHE_TTL_MS) {
      log?.info('PR history: read from GitHub GraphQL (no LLM)', {
        repoId: ctx.repoId,
        ref: ctx.base,
        filesQueried: paths.length,
        prsFound: hit.value.history.length,
        cached: true,
        durationMs: 0,
      });
      return hit.value;
    }

    let github;
    try {
      github = await this.deps.github();
    } catch (err) {
      return this.notAvailable(log, ctx, err instanceof ConfigError ? 'no_token' : 'github_error', err);
    }

    let ref = ctx.base;
    let data: PathPullHistory;
    try {
      data = await github.listPathPullHistory(ctx.repo, this.query(ref, paths));
      if (!data.refFound && ctx.defaultBranch !== ctx.base) {
        ref = ctx.defaultBranch;
        data = await github.listPathPullHistory(ctx.repo, this.query(ref, paths));
      }
    } catch (err) {
      return this.notAvailable(log, ctx, 'github_error', err);
    }
    if (!data.refFound) {
      return this.notAvailable(log, ctx, 'github_error', new Error(`ref not found: ${ref}`));
    }

    const value: PrHistoryResponse = {
      history: selectPriorPrs(data, {
        currentPrNumber: ctx.number,
        maxPrs: HISTORY_MAX_PRS,
        maxChangedFiles: HISTORY_MAX_PR_CHANGED_FILES,
      }),
      degraded: false,
      degraded_reason: null,
    };
    this.store(key, value);
    log?.info('PR history: read from GitHub GraphQL (no LLM)', {
      repoId: ctx.repoId,
      ref,
      filesQueried: paths.length,
      prsFound: value.history.length,
      cached: false,
      durationMs: this.deps.now() - started,
    });
    return value;
  }

  private query(ref: string, paths: string[]) {
    return {
      ref,
      paths,
      commitsPerPath: HISTORY_COMMITS_PER_FILE,
      pullsPerCommit: HISTORY_PULLS_PER_COMMIT,
    };
  }

  private store(key: string, value: PrHistoryResponse): void {
    this.cache.delete(key);
    this.cache.set(key, { storedAt: this.deps.now(), value });
    while (this.cache.size > HISTORY_CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.cache.delete(oldest);
    }
  }

  /** Degraded result + the single log line; only the error message is logged, never secrets. */
  private notAvailable(
    log: HistoryLog | undefined,
    ctx: HistoryPullContext,
    reason: Degraded,
    err?: unknown,
  ): PrHistoryResponse {
    log?.info('PR history: not available', {
      repoId: ctx.repoId,
      reason,
      ...(err !== undefined ? { error: err instanceof Error ? err.message : String(err) } : {}),
    });
    return degraded(reason);
  }
}
