import type { PrBlastRadiusResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_CALLERS_PER_SYMBOL } from '../repo-intel/constants.js';
import { resolveDegradation, toBlastRadius } from './mapping.js';
import type { BlastFacade, BlastLog, BlastServiceDeps } from './types.js';

/**
 * Blast radius of a PR, read from the persisted repo-intel index only — no
 * re-parsing, no LLM, no GitHub. When the index is unusable the facade is NOT
 * called (its fallback would rescan the clone); the response is an empty map
 * with the degradation reason instead.
 */
export class BlastService implements BlastFacade {
  constructor(private deps: BlastServiceDeps) {}

  async getForPull(
    workspaceId: string,
    prId: string,
    log?: BlastLog,
  ): Promise<PrBlastRadiusResponse> {
    const { repo, repoIntel, repoIntelEnabled } = this.deps;
    const started = Date.now();
    const pull = await repo.getPullContext(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const empty = (
      d: ReturnType<typeof resolveDegradation>,
      indexedSha: string | null,
    ): PrBlastRadiusResponse => ({
      changed_symbols: [],
      downstream: [],
      summary: toBlastRadius(
        { changedSymbols: [], callers: [], impactedEndpoints: [] },
        { maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL },
      ).summary,
      ...d,
      indexed_sha: indexedSha,
    });

    if (!repoIntelEnabled) {
      const d = resolveDegradation({ enabled: false, state: { status: 'degraded' } });
      log?.info('Blast radius: index not usable, nothing read', {
        repoId: pull.repoId,
        reason: d.degraded_reason,
      });
      return empty(d, null);
    }

    const state = await repoIntel.getIndexState(pull.repoId);
    if (state.status !== 'full' && state.status !== 'partial') {
      const d = resolveDegradation({ enabled: true, state });
      log?.info('Blast radius: index not usable, nothing read', {
        repoId: pull.repoId,
        reason: d.degraded_reason,
      });
      return empty(d, null);
    }
    const indexedSha = state.lastIndexedSha || null;

    if (pull.files.length === 0) {
      return {
        ...empty({ degraded: false, degraded_reason: null }, indexedSha),
        ...(state.status === 'partial' ? { degraded: true, degraded_reason: 'index_partial' } : {}),
      };
    }

    const result = await repoIntel.getBlastRadius(pull.repoId, pull.files);
    const blast = toBlastRadius(result, { maxCallersPerSymbol: MAX_CALLERS_PER_SYMBOL });
    const d = resolveDegradation({ enabled: true, state, result });

    log?.info('Blast radius: read from persisted index', {
      repoId: pull.repoId,
      indexStatus: state.status,
      indexedSha,
      changedFiles: pull.files.length,
      symbols: blast.changed_symbols.length,
      callers: blast.downstream.reduce((n, x) => n + x.callers.length, 0),
      endpoints: new Set(blast.downstream.flatMap((x) => x.endpoints_affected)).size,
      crons: new Set(blast.downstream.flatMap((x) => x.crons_affected)).size,
      degraded: d.degraded,
      reason: d.degraded_reason,
      durationMs: Date.now() - started,
    });

    return { ...blast, ...d, indexed_sha: indexedSha };
  }
}
