import { describe, it, expect } from 'vitest';
import {
  buildBuckets,
  buildDetail,
  buildOverview,
  type OverviewInput,
} from '../src/modules/agent-performance/aggregate.js';
import type {
  AgentRef,
  DecisionCount,
  LastRun,
  RunFact,
  TimeRange,
} from '../src/modules/agent-performance/types.js';

/**
 * SPEC-10 — the pure aggregation behind both Agent Performance reads (AC-7..AC-18, AC-21, AC-22,
 * AC-53..AC-58, NFR-4). No DB: facts in, response shape out.
 */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const FROM = new Date('2026-03-01T00:00:00.000Z');
const THIRTY_DAYS: TimeRange = { from: FROM, to: new Date(FROM.getTime() + 30 * DAY) };
const REPO = { id: 'repo-1', fullName: 'acme/web' };

let seq = 0;
const at = (hoursIn: number) => new Date(FROM.getTime() + hoursIn * HOUR);

function run(over: Partial<RunFact> & { agentId: string | null }): RunFact {
  seq += 1;
  return {
    id: `run-${String(seq).padStart(4, '0')}`,
    ranAt: at(1),
    status: 'done',
    source: 'local',
    costUsd: 0.1,
    costSource: 'provider',
    durationMs: 1000,
    model: 'm-a',
    ...over,
  };
}

const agent = (id: string, name: string, enabled = true): AgentRef => ({ id, name, enabled });
const decision = (runId: string, accepted: number, dismissed: number, undecided = 0): DecisionCount => ({
  runId,
  accepted,
  dismissed,
  undecided,
});

function overview(over: Partial<OverviewInput>) {
  return buildOverview({
    repo: REPO,
    range: THIRTY_DAYS,
    agents: [],
    runs: [],
    previousRuns: [],
    decisions: [],
    lastRuns: [],
    ...over,
  });
}

const A = agent('a', 'Alpha');
const B = agent('b', 'Beta');
const rowOf = (o: ReturnType<typeof overview>, id: string) => o.rows.find((r) => r.agent_id === id)!;

describe('counted runs, failures, averages (AC-7, AC-9..AC-12, AC-31)', () => {
  it('counts done/failed/cancelled, never running; averages use only done runs', () => {
    const runs = [
      run({ agentId: 'a', status: 'done', costUsd: 0.2, durationMs: 1000 }),
      run({ agentId: 'a', status: 'done', costUsd: 0.4, durationMs: 3000 }),
      run({ agentId: 'a', status: 'done', costUsd: null, costSource: null, durationMs: null }),
      run({ agentId: 'a', status: 'failed', costUsd: 9, durationMs: 99_999 }),
      run({ agentId: 'a', status: 'cancelled', costUsd: 9, durationMs: 99_999 }),
      run({ agentId: 'a', status: 'running', costUsd: 50, durationMs: 50_000 }),
    ];
    const o = overview({ agents: [A], runs });
    const row = rowOf(o, 'a');

    expect(row.runs).toBe(5);
    expect(row.failed).toBe(1);
    expect(o.totals.runs).toBe(5);
    expect(o.totals.failed).toBe(1);
    // mean of the two priced `done` runs only (failed/cancelled/running excluded, null not treated as 0)
    expect(row.avg_cost_usd).toBeCloseTo(0.3, 12);
    expect(row.avg_duration_ms).toBeCloseTo(2000, 12);
  });

  it('shows null (never 0) for averages, accept rate and last run when there is nothing to average', () => {
    const runs = [run({ agentId: 'a', status: 'failed', costUsd: null, costSource: null, durationMs: null })];
    const row = rowOf(overview({ agents: [A], runs }), 'a');
    expect(row.runs).toBe(1);
    expect(row.avg_cost_usd).toBeNull();
    expect(row.avg_duration_ms).toBeNull();
    expect(row.accept.rate).toBeNull();
    expect(row.cost_per_accepted_usd).toBeNull();
    expect(row.last_run_at).toBeNull();
  });
});

describe('cost: unpriced runs, by source, by agent and by model (AC-10, AC-18, AC-53, AC-54)', () => {
  const orphanRun = run({ agentId: null, costUsd: 0.5, model: 'm-orphan' });
  const runs = [
    run({ agentId: 'a', costUsd: 0.1, costSource: 'provider', model: 'm-a' }),
    run({ agentId: 'a', costUsd: 0.3, costSource: 'estimate', model: 'm-a' }),
    run({ agentId: 'b', costUsd: 0.3, costSource: null, model: null }), // old row, no model
    run({ agentId: 'b', costUsd: null, costSource: null, status: 'failed' }),
    orphanRun,
  ];
  const o = overview({ agents: [A, B], runs });

  it('adds null-cost runs to nothing, counts them as not priced, splits cost by source (null source = unknown)', () => {
    expect(o.totals.total_cost_usd).toBeCloseTo(1.2, 12);
    expect(o.totals.not_priced_runs).toBe(1);
    expect(o.totals.cost_by_source.provider).toBeCloseTo(0.1 + 0.5, 12); // orphan run is 'provider' (default fact)
    expect(o.totals.cost_by_source.estimate).toBeCloseTo(0.3, 12);
    expect(o.totals.cost_by_source.mixed).toBe(0);
    expect(o.totals.cost_by_source.unknown).toBeCloseTo(0.3, 12);
  });

  it('forms a null-id "deleted agent" slice and a null-model "unknown model" slice; no row for the deleted agent', () => {
    expect(o.rows.map((r) => r.agent_id)).toEqual(['a', 'b']);
    expect(o.totals.runs).toBe(5); // the deleted agent's run still counts in the totals
    const deleted = o.cost_by_agent.filter((s) => s.agent_id === null);
    expect(deleted).toHaveLength(1);
    expect(deleted[0]!.cost_usd).toBeCloseTo(0.5, 12);
    const unknown = o.cost_by_model.filter((s) => s.model === null);
    expect(unknown).toHaveLength(1);
    expect(unknown[0]!.cost_usd).toBeCloseTo(0.3, 12);
  });

  it('both breakdowns add up to Total cost, ordered by amount descending', () => {
    const sum = (xs: { cost_usd: number }[]) => xs.reduce((s, x) => s + x.cost_usd, 0);
    expect(Math.abs(sum(o.cost_by_agent) - o.totals.total_cost_usd)).toBeLessThan(1e-9);
    expect(Math.abs(sum(o.cost_by_model) - o.totals.total_cost_usd)).toBeLessThan(1e-9);
    expect(o.cost_by_agent.map((s) => s.agent_id)).toEqual([null, 'a', 'b']);
    expect(o.cost_by_model.map((s) => s.model)).toEqual(['m-orphan', 'm-a', null]);
  });

  it('a deleted agent is never the most-active agent', () => {
    const many = Array.from({ length: 5 }, () => run({ agentId: null }));
    const o2 = overview({ agents: [A], runs: [run({ agentId: 'a' }), ...many] });
    expect(o2.totals.runs).toBe(6);
    expect(o2.totals.most_active?.agent_id).toBe('a');
  });
});

describe('accept rate (AC-13, AC-14, AC-15, AC-58)', () => {
  it('uses decisions of local runs only, ignoring a CI run even if decisions exist for it', () => {
    const local = run({ agentId: 'a', source: 'local' });
    const ci = run({ agentId: 'a', source: 'ci', costSource: null });
    const o = overview({
      agents: [A],
      runs: [local, ci],
      decisions: [decision(local.id, 3, 1, 2), decision(ci.id, 40, 40, 40)],
    });
    const accept = rowOf(o, 'a').accept;
    expect(accept).toEqual({ rate: 0.75, accepted: 3, dismissed: 1, decisions: 4, low_sample: true });
  });

  it.each([
    { decisions: 0, low: false, rate: null },
    { decisions: 9, low: true, rate: 1 },
    { decisions: 10, low: false, rate: 1 },
  ])('low sample is $low at $decisions decisions', ({ decisions: n, low, rate }) => {
    const r = run({ agentId: 'a' });
    const o = overview({ agents: [A], runs: [r], decisions: n === 0 ? [] : [decision(r.id, n, 0)] });
    const accept = rowOf(o, 'a').accept;
    expect(accept.decisions).toBe(n);
    expect(accept.low_sample).toBe(low);
    expect(accept.rate).toBe(rate);
  });

  it('Avg accept rate is pooled (Σaccepted / Σdecisions), including runs of deleted agents', () => {
    const ra = run({ agentId: 'a' });
    const rb = run({ agentId: 'b' });
    const ro = run({ agentId: null });
    const o = overview({
      agents: [A, B],
      runs: [ra, rb, ro],
      // A 1/1 = 100 %, B 1/4 = 25 %, deleted 0/5: mean of rates would be 62.5 %, pooled is 2/10
      decisions: [decision(ra.id, 1, 0), decision(rb.id, 1, 3), decision(ro.id, 0, 5)],
    });
    expect(o.totals.accept).toEqual({ rate: 0.2, accepted: 2, dismissed: 8, decisions: 10, low_sample: false });
  });

  it('has a null rate when nothing is decided', () => {
    const r = run({ agentId: 'a' });
    const o = overview({ agents: [A], runs: [r], decisions: [decision(r.id, 0, 0, 7)] });
    expect(o.totals.accept.rate).toBeNull();
    expect(o.totals.accept.decisions).toBe(0);
  });

  it('cost per accepted = local priced cost / accepted; null when nothing accepted or nothing priced', () => {
    const r1 = run({ agentId: 'a', costUsd: 0.2 });
    const r2 = run({ agentId: 'a', costUsd: 0.4 });
    const ci = run({ agentId: 'a', source: 'ci', costUsd: 100, costSource: null }); // CI cost is excluded
    const o = overview({
      agents: [A, B],
      runs: [r1, r2, ci, run({ agentId: 'b', costUsd: 1 }), run({ agentId: 'b', costUsd: 1 })],
      decisions: [decision(r1.id, 2, 0), decision(r2.id, 1, 1)],
    });
    expect(rowOf(o, 'a').cost_per_accepted_usd).toBeCloseTo(0.6 / 3, 12);
    expect(rowOf(o, 'b').cost_per_accepted_usd).toBeNull(); // priced, but accepted = 0

    const unpriced = run({ agentId: 'a', costUsd: null, costSource: null });
    const o2 = overview({ agents: [A], runs: [unpriced], decisions: [decision(unpriced.id, 2, 0)] });
    expect(rowOf(o2, 'a').cost_per_accepted_usd).toBeNull(); // accepted, but nothing priced
  });
});

describe('listed agents, last run, most-active (AC-16, AC-17, AC-55, NFR-4)', () => {
  it('lists enabled agents and only those disabled agents that have a counted run', () => {
    const off = agent('off', 'Off', false);
    const offIdle = agent('off2', 'Off idle', false);
    const o = overview({
      agents: [A, off, offIdle],
      runs: [run({ agentId: 'off' }), run({ agentId: 'off2', status: 'running' })],
    });
    expect(o.rows.map((r) => r.agent_id)).toEqual(['a', 'off']);
    expect(rowOf(o, 'off').enabled).toBe(false);
    expect(rowOf(o, 'a').runs).toBe(0); // an enabled agent without runs still has a row
  });

  it('takes Last run from the supplied last-run facts (any time), null when none', () => {
    const last: LastRun = { agentId: 'a', at: new Date('2025-01-01T00:00:00.000Z') };
    const o = overview({ agents: [A, B], runs: [], lastRuns: [last] });
    expect(rowOf(o, 'a').last_run_at).toBe('2025-01-01T00:00:00.000Z');
    expect(rowOf(o, 'b').last_run_at).toBeNull();
  });

  it('most-active: most runs, then latest last run, then name; none while nobody ran', () => {
    expect(overview({ agents: [A, B] }).totals.most_active).toBeNull();

    const twoEach = [
      run({ agentId: 'a' }),
      run({ agentId: 'a' }),
      run({ agentId: 'b' }),
      run({ agentId: 'b' }),
    ];
    const later = overview({
      agents: [A, B],
      runs: twoEach,
      lastRuns: [
        { agentId: 'a', at: at(5) },
        { agentId: 'b', at: at(9) },
      ],
    });
    expect(later.totals.most_active?.agent_id).toBe('b'); // tie on runs → later last run wins

    const sameLast = overview({
      agents: [B, A],
      runs: twoEach,
      lastRuns: [
        { agentId: 'a', at: at(5) },
        { agentId: 'b', at: at(5) },
      ],
    });
    expect(sameLast.totals.most_active).toMatchObject({ agent_id: 'a', name: 'Alpha', runs: 2 }); // → name
  });

  it('orders rows by name, case-insensitively and identically for any input order', () => {
    const agents = [agent('3', 'zeta'), agent('1', 'Beta'), agent('2', 'alpha')];
    const runs = [run({ agentId: '1' }), run({ agentId: '2' })];
    const first = overview({ agents, runs });
    const second = overview({ agents: [...agents].reverse(), runs: [...runs].reverse() });
    expect(first.rows.map((r) => r.name)).toEqual(['alpha', 'Beta', 'zeta']);
    expect(second).toEqual(first);
  });
});

describe('buckets and previous period (AC-56, AC-57)', () => {
  const countedAt = (hoursIn: number[]) => hoursIn.map((h) => run({ agentId: 'a', ranAt: at(h) }));

  it('a 24 h range has 24 hourly buckets that start at `from` and add up to Runs', () => {
    const range = { from: FROM, to: new Date(FROM.getTime() + DAY) };
    const o = overview({ range, agents: [A], runs: countedAt([0, 0.5, 5, 23.99]) });
    expect(o.buckets).toHaveLength(24);
    expect(o.buckets[0]).toEqual({ start: FROM.toISOString(), runs: 2 });
    expect(o.buckets[5]!.runs).toBe(1);
    expect(o.buckets[23]!.runs).toBe(1);
    expect(o.buckets.reduce((s, b) => s + b.runs, 0)).toBe(o.totals.runs);
  });

  it('a 30-day range has 30 daily buckets; a running run is not in any bucket', () => {
    const runs = [...countedAt([1, 25, 30 * 24 - 1]), run({ agentId: 'a', status: 'running', ranAt: at(2) })];
    const o = overview({ agents: [A], runs });
    expect(o.buckets).toHaveLength(30);
    expect(o.buckets.map((b) => b.runs).slice(0, 3)).toEqual([1, 1, 0]);
    expect(o.buckets[29]!.runs).toBe(1);
    expect(o.buckets.reduce((s, b) => s + b.runs, 0)).toBe(3);
  });

  it('a range of 25 hours uses daily buckets and the last one is cut at `to`', () => {
    const range = { from: FROM, to: new Date(FROM.getTime() + 25 * HOUR) };
    const b = buildBuckets(range, countedAt([1, 24.5]));
    expect(b.map((x) => x.runs)).toEqual([1, 1]);
    expect(b).toHaveLength(2);
  });

  it('a short range gets ceil(span / 1 h) hourly buckets', () => {
    const range = { from: FROM, to: new Date(FROM.getTime() + 2.5 * HOUR) };
    expect(buildBuckets(range, [])).toHaveLength(3);
  });

  it('previous period: total cost of its counted runs, has_runs only for counted ones', () => {
    const prev = [
      run({ agentId: 'a', costUsd: 0.25 }),
      run({ agentId: 'a', costUsd: null, costSource: null }),
      run({ agentId: 'a', status: 'running', costUsd: 99 }),
    ];
    const o = overview({ agents: [A], previousRuns: prev });
    expect(o.previous_period.total_cost_usd).toBeCloseTo(0.25, 12);
    expect(o.previous_period.has_runs).toBe(true);

    const onlyRunning = overview({ agents: [A], previousRuns: [run({ agentId: 'a', status: 'running' })] });
    expect(onlyRunning.previous_period).toEqual({ total_cost_usd: 0, has_runs: false });
  });
});

describe('per-agent read parity (AC-21, AC-22)', () => {
  it('buildDetail returns the same row fields as the agent’s overview row, plus its extras', () => {
    const r1 = run({ agentId: 'a', costUsd: 0.2, model: 'm-a' });
    const r2 = run({ agentId: 'a', source: 'ci', costUsd: 0.3, costSource: null, model: 'm-b' });
    const r3 = run({ agentId: 'a', status: 'failed', costUsd: null, costSource: null });
    const runs = [r1, r2, r3];
    const decisions = [decision(r1.id, 2, 1, 4)];
    const lastRun = at(7);

    const o = overview({ agents: [A, B], runs: [...runs, run({ agentId: 'b' })], decisions, lastRuns: [{ agentId: 'a', at: lastRun }] });
    const d = buildDetail({ repo: REPO, range: THIRTY_DAYS, agent: A, runs, decisions, lastRunAt: lastRun });

    const { repo, range, cost_by_model, not_priced_runs, cost_by_source, undecided, runs_by_source, ...row } = d;
    expect(row).toEqual(rowOf(o, 'a'));
    expect(repo).toEqual({ id: 'repo-1', full_name: 'acme/web' });
    expect(range).toEqual({ from: THIRTY_DAYS.from.toISOString(), to: THIRTY_DAYS.to.toISOString() });
    expect(cost_by_model.map((s) => s.model)).toEqual(['m-b', 'm-a']);
    expect(not_priced_runs).toBe(1);
    expect(cost_by_source.provider).toBeCloseTo(0.2, 12);
    expect(cost_by_source.unknown).toBeCloseTo(0.3, 12);
    expect(undecided).toBe(4);
    expect(runs_by_source).toEqual({ local: 2, ci: 1 });
  });

  it('an agent without counted runs gets zeros and nulls and an empty by-model breakdown', () => {
    const d = buildDetail({ repo: REPO, range: THIRTY_DAYS, agent: A, runs: [], decisions: [], lastRunAt: null });
    expect(d).toMatchObject({
      runs: 0,
      failed: 0,
      avg_cost_usd: null,
      avg_duration_ms: null,
      cost_per_accepted_usd: null,
      last_run_at: null,
      cost_by_model: [],
      not_priced_runs: 0,
      undecided: 0,
      runs_by_source: { local: 0, ci: 0 },
    });
    expect(d.accept).toEqual({ rate: null, accepted: 0, dismissed: 0, decisions: 0, low_sample: false });
  });
});
