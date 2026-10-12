import { describe, it, expect } from 'vitest';
import { median, summariseEstimate, toAgentEstimate } from '../src/modules/reviews/multi-agent/estimate.js';

/**
 * SPEC-08 T-3 — AC-15/16/53/56: the estimate is the median of the recent done runs;
 * a missing value stays null and is counted, never treated as zero.
 */
describe('median', () => {
  it('odd count -> the middle value; even count -> mean of the two middle values; empty -> null', () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 30, 20])).toBe(25);
    expect(median([])).toBeNull();
  });
});

describe('toAgentEstimate', () => {
  it('median duration (rounded to int) and median cost, with the run counts behind each', () => {
    expect(toAgentEstimate({ agent_id: 'a', durations: [1000, 2001], costs: [0.01, 0.03, 0.02] })).toEqual({
      agent_id: 'a',
      duration_ms: 1501, // 1500.5 rounded
      cost_usd: 0.02,
      runs: 2,
      cost_runs: 3,
    });
  });

  it('an agent without history gets null estimates and zero runs (rendered as "—")', () => {
    expect(toAgentEstimate({ agent_id: 'a', durations: [], costs: [] })).toEqual({
      agent_id: 'a',
      duration_ms: null,
      cost_usd: null,
      runs: 0,
      cost_runs: 0,
    });
  });
});

describe('summariseEstimate', () => {
  const est = (agent_id: string, duration_ms: number | null, cost_usd: number | null) => ({
    agent_id,
    duration_ms,
    cost_usd,
    runs: duration_ms === null ? 0 : 3,
    cost_runs: cost_usd === null ? 0 : 3,
  });

  it('time = slowest checked agent, cost = sum; only the checked agents count', () => {
    const r = summariseEstimate([est('a', 4000, 0.1), est('b', 9000, 0.25), est('c', 99999, 5)], ['a', 'b']);
    expect(r).toEqual({ time_ms: 9000, cost_usd: 0.35, agents_without_time: 0, agents_without_cost: 0 });
  });

  it('agents without a value are left out of the matching total and counted separately', () => {
    const r = summariseEstimate([est('a', 4000, null), est('b', null, 0.2)], ['a', 'b', 'unknown']);
    expect(r).toEqual({ time_ms: 4000, cost_usd: 0.2, agents_without_time: 2, agents_without_cost: 2 });
  });

  it('nothing known -> null totals (not 0)', () => {
    expect(summariseEstimate([], ['a'])).toEqual({ time_ms: null, cost_usd: null, agents_without_time: 1, agents_without_cost: 1 });
  });
});
