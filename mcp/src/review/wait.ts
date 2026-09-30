import type { RunSummary } from '@devdigest/shared';
import { MAX_TRANSIENT_ERRORS, POLL_INTERVAL_MS, TERMINAL_RUN_STATUSES } from '../constants.js';

export type WaitOutcome = 'completed' | 'partial' | 'aborted';

export interface WaitResult {
  outcome: WaitOutcome;
  /** The last successfully-fetched run rows for the polled ids (best effort —
   * may be stale by one interval when the loop stopped on a transient error). */
  runs: RunSummary[];
}

export interface WaitForRunsArgs {
  /** Fetch the current `RunSummary[]` for the PR (the caller filters to the
   * ids it cares about; this stays a pure polling loop otherwise). */
  fetchRuns: () => Promise<RunSummary[]>;
  runIds: string[];
  deadline: number;
  intervalMs?: number;
  signal?: AbortSignal;
  onProgress?: (info: { elapsedMs: number; runs: RunSummary[] }) => void;
  /** Injected clock + sleep so tests run with no real timers. */
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

function isTerminal(status: string | null): boolean {
  return status != null && (TERMINAL_RUN_STATUSES as readonly string[]).includes(status);
}

/**
 * Poll `fetchRuns` every `intervalMs` until every `runIds` row is terminal, the
 * deadline passes, or `signal` fires. Never throws on a transient fetch error —
 * up to `MAX_TRANSIENT_ERRORS` in a row are swallowed; one more in a row also
 * stops the loop and returns `partial` with whatever was last observed.
 */
export async function waitForRuns(args: WaitForRunsArgs): Promise<WaitResult> {
  const now = args.now ?? Date.now;
  const sleep = args.sleep ?? ((ms: number) => new Promise((r) => setTimeout(r, ms)));
  const intervalMs = args.intervalMs ?? POLL_INTERVAL_MS;
  const runIdSet = new Set(args.runIds);
  const startedAt = now();

  let lastRuns: RunSummary[] = [];
  let transientErrors = 0;

  while (true) {
    if (args.signal?.aborted) return { outcome: 'aborted', runs: lastRuns };

    try {
      const all = await args.fetchRuns();
      lastRuns = all.filter((r) => runIdSet.has(r.run_id));
      transientErrors = 0;
      args.onProgress?.({ elapsedMs: now() - startedAt, runs: lastRuns });
      const allTerminal = lastRuns.length === runIdSet.size && lastRuns.every((r) => isTerminal(r.status));
      if (allTerminal) return { outcome: 'completed', runs: lastRuns };
    } catch {
      transientErrors += 1;
      if (transientErrors > MAX_TRANSIENT_ERRORS) return { outcome: 'partial', runs: lastRuns };
    }

    if (now() >= args.deadline) return { outcome: 'partial', runs: lastRuns };
    if (args.signal?.aborted) return { outcome: 'aborted', runs: lastRuns };
    await sleep(intervalMs);
  }
}
