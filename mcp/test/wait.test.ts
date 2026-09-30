import { describe, it, expect, vi } from 'vitest';
import { waitForRuns } from '../src/review/wait.js';
import type { RunSummary } from '@devdigest/shared';

function run(id: string, status: string): RunSummary {
  return {
    run_id: id,
    agent_id: null,
    agent_name: `agent-${id}`,
    provider: null,
    model: null,
    status,
    error: null,
    duration_ms: null,
    tokens_in: null,
    tokens_out: null,
    cost_usd: null,
    findings_count: null,
    grounding: null,
    ran_at: null,
    score: null,
    blockers: null,
  };
}

/** A fake clock that advances only when `sleep` is awaited — no real timers. */
function fakeClock(startMs: number) {
  let t = startMs;
  const now = () => t;
  const sleep = async (ms: number) => {
    t += ms;
  };
  return { now, sleep };
}

describe('waitForRuns', () => {
  it('returns "completed" once every run is terminal', async () => {
    const clock = fakeClock(0);
    let call = 0;
    const fetchRuns = vi.fn(async () => {
      call += 1;
      return [run('r1', call < 2 ? 'running' : 'done')];
    });
    const result = await waitForRuns({
      fetchRuns,
      runIds: ['r1'],
      deadline: 120_000,
      intervalMs: 2_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.outcome).toBe('completed');
    expect(result.runs[0]!.status).toBe('done');
  });

  it('returns "partial" with the run_ids once the deadline passes', async () => {
    const clock = fakeClock(0);
    const fetchRuns = vi.fn(async () => [run('r1', 'running')]);
    const result = await waitForRuns({
      fetchRuns,
      runIds: ['r1'],
      deadline: 5_000,
      intervalMs: 2_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.outcome).toBe('partial');
    expect(result.runs[0]!.run_id).toBe('r1');
  });

  it('returns "aborted" as soon as the signal fires', async () => {
    const clock = fakeClock(0);
    const controller = new AbortController();
    controller.abort();
    const fetchRuns = vi.fn(async () => [run('r1', 'running')]);
    const result = await waitForRuns({
      fetchRuns,
      runIds: ['r1'],
      deadline: 120_000,
      now: clock.now,
      sleep: clock.sleep,
      signal: controller.signal,
    });
    expect(result.outcome).toBe('aborted');
    expect(fetchRuns).not.toHaveBeenCalled();
  });

  it('tolerates up to 3 transient errors in a row, then reports partial', async () => {
    const clock = fakeClock(0);
    const fetchRuns = vi.fn(async () => {
      throw new Error('ECONNRESET');
    });
    const result = await waitForRuns({
      fetchRuns,
      runIds: ['r1'],
      deadline: 120_000,
      intervalMs: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.outcome).toBe('partial');
    // 3 tolerated + the 4th trips the stop → 4 calls total.
    expect(fetchRuns).toHaveBeenCalledTimes(4);
  });

  it('recovers after a transient error if a later poll succeeds', async () => {
    const clock = fakeClock(0);
    let call = 0;
    const fetchRuns = vi.fn(async () => {
      call += 1;
      if (call === 1) throw new Error('ECONNRESET');
      return [run('r1', 'done')];
    });
    const result = await waitForRuns({
      fetchRuns,
      runIds: ['r1'],
      deadline: 120_000,
      intervalMs: 1_000,
      now: clock.now,
      sleep: clock.sleep,
    });
    expect(result.outcome).toBe('completed');
  });

  it('calls onProgress with monotonically increasing elapsed time', async () => {
    const clock = fakeClock(0);
    let call = 0;
    const fetchRuns = vi.fn(async () => {
      call += 1;
      return [run('r1', call < 3 ? 'running' : 'done')];
    });
    const elapsed: number[] = [];
    await waitForRuns({
      fetchRuns,
      runIds: ['r1'],
      deadline: 120_000,
      intervalMs: 2_000,
      now: clock.now,
      sleep: clock.sleep,
      onProgress: (info) => elapsed.push(info.elapsedMs),
    });
    for (let i = 1; i < elapsed.length; i++) {
      expect(elapsed[i]).toBeGreaterThan(elapsed[i - 1]!);
    }
  });
});
