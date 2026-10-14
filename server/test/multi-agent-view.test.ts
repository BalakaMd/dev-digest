import { describe, it, expect } from 'vitest';
import {
  buildMultiAgentRun,
  type MultiAgentEntryInput,
  type MultiAgentRecordInput,
} from '../src/modules/reviews/multi-agent/view.js';
import type { FindingRow } from '../src/modules/reviews/repository.js';
import { findingRowToDto, type ReviewDtoFinding } from '../src/modules/reviews/helpers.js';

/**
 * SPEC-08 T-4 — AC-26, NFR-2: the read model assembled from stored rows — totals only
 * once every run ended, cost sum + incomplete flag, stable column order, latest log
 * only for running runs.
 */
const T0 = new Date('2026-10-11T10:00:00.000Z');
const at = (ms: number) => new Date(T0.getTime() + ms);

const record: MultiAgentRecordInput = {
  id: 'mar-1',
  prId: 'pr-1',
  repoId: 'repo-1',
  prNumber: 482,
  prTitle: 'Add rate limiting',
  ranAt: T0,
  estimate: { time_ms: 5000, cost_usd: 0.1, agents_without_time: 0, agents_without_cost: 0 },
};

function finding(id: string, o: Partial<FindingRow> = {}): ReviewDtoFinding {
  return findingRowToDto({
    id,
    reviewId: 'rev',
    file: 'src/a.ts',
    startLine: 5,
    endLine: 5,
    severity: 'WARNING',
    category: 'bug',
    title: `title-${id}`,
    rationale: 'r',
    suggestion: null,
    confidence: 0.9,
    kind: 'finding',
    trifectaComponents: null,
    citedDocs: null,
    acceptedAt: null,
    dismissedAt: null,
    scope: null,
    ...o,
  });
}

function entry(runId: string, o: Partial<MultiAgentEntryInput> = {}): MultiAgentEntryInput {
  return {
    runId,
    agentId: `agent-${runId}`,
    agentName: `Agent ${runId}`,
    provider: 'openai',
    model: 'gpt-4.1',
    status: 'done',
    error: null,
    durationMs: 1000,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.01,
    ranAt: T0,
    finishedAt: at(1000),
    review: { verdict: 'comment', summary: `summary ${runId}`, score: 80 },
    findings: [],
    ...o,
  };
}

describe('buildMultiAgentRun', () => {
  it('header fields, agent count and the estimate recorded at trigger time are passed through', () => {
    const run = buildMultiAgentRun(record, [entry('r1'), entry('r2')]);
    expect(run).toMatchObject({
      id: 'mar-1',
      pr_id: 'pr-1',
      repo_id: 'repo-1',
      pr_number: 482,
      pr_title: 'Add rate limiting',
      ran_at: T0.toISOString(),
      agent_count: 2,
      estimate: record.estimate,
    });
  });

  describe('totals', () => {
    it('total time = last finish - start, total cost = sum, once every run ended', () => {
      const run = buildMultiAgentRun(record, [
        entry('r1', { finishedAt: at(3000), costUsd: 0.01 }),
        entry('r2', { finishedAt: at(7500), costUsd: 0.02, status: 'failed' }),
      ]);
      expect(run.total_duration_ms).toBe(7500);
      expect(run.total_cost_usd).toBeCloseTo(0.03, 10);
      expect(run.cost_incomplete).toBe(false);
    });

    it('total time stays null while any run is still running (even if others ended)', () => {
      const run = buildMultiAgentRun(record, [
        entry('r1', { finishedAt: at(3000) }),
        entry('r2', { status: 'running', finishedAt: null, costUsd: null }),
      ]);
      expect(run.total_duration_ms).toBeNull();
    });

    it('a null cost is left out of the sum and flags the total as incomplete', () => {
      const run = buildMultiAgentRun(record, [entry('r1', { costUsd: 0.05 }), entry('r2', { costUsd: null })]);
      expect(run.total_cost_usd).toBe(0.05);
      expect(run.cost_incomplete).toBe(true);
    });

    it('all costs null -> total cost null (not 0), flagged incomplete', () => {
      const run = buildMultiAgentRun(record, [entry('r1', { costUsd: null }), entry('r2', { costUsd: null })]);
      expect(run.total_cost_usd).toBeNull();
      expect(run.cost_incomplete).toBe(true);
    });
  });

  describe('columns', () => {
    it('are ordered by agent name (case-insensitive), then run id; an unknown agent (null name) goes last', () => {
      const run = buildMultiAgentRun(record, [
        entry('r1', { agentName: null, agentId: null }),
        entry('r2', { agentName: 'beta' }),
        entry('r3', { agentName: 'Alpha' }),
        entry('r0', { agentName: 'ALPHA' }),
      ]);
      expect(run.columns.map((c) => c.run_id)).toEqual(['r0', 'r3', 'r2', 'r1']);
      expect(run.columns[3]).toMatchObject({ agent_id: null, agent_name: null });
    });

    it('order does not depend on the input order (NFR-2)', () => {
      const entries = [entry('r1', { agentName: 'b' }), entry('r2', { agentName: 'a' }), entry('r3', { agentName: 'c' })];
      const a = buildMultiAgentRun(record, entries);
      const b = buildMultiAgentRun(record, [...entries].reverse());
      expect(b).toEqual(a);
    });

    it('an unknown or null status is reported as failed', () => {
      const run = buildMultiAgentRun(record, [entry('r1', { status: null }), entry('r2', { status: 'weird' })]);
      expect(run.columns.map((c) => c.status)).toEqual(['failed', 'failed']);
    });

    it('latest_log is shown only for running runs', () => {
      const logs = new Map<string, string | null>([
        ['r1', 'Calling model…'],
        ['r2', 'stale line'],
      ]);
      const run = buildMultiAgentRun(
        record,
        [entry('r1', { status: 'running', finishedAt: null }), entry('r2', { status: 'done' })],
        logs,
      );
      expect(run.columns.map((c) => [c.run_id, c.latest_log])).toEqual([
        ['r1', 'Calling model…'],
        ['r2', null],
      ]);
    });

    it('carries review fields and a failed run keeps its error text', () => {
      const run = buildMultiAgentRun(record, [
        entry('r1'),
        entry('r2', { agentName: 'Z', status: 'failed', error: 'boom', review: null }),
      ]);
      expect(run.columns[0]).toMatchObject({ verdict: 'comment', summary: 'summary r1', score: 80, duration_ms: 1000 });
      expect(run.columns[1]).toMatchObject({ status: 'failed', error: 'boom', verdict: null, summary: null, score: null });
    });
  });

  it('groups and conflicts are built from the columns without dropping any finding (AC-26, AC-43)', () => {
    const run = buildMultiAgentRun(record, [
      entry('r1', { findings: [finding('f1', { startLine: 5, endLine: 7 })] }),
      entry('r2', { findings: [finding('f2', { startLine: 7, endLine: 9, severity: 'CRITICAL' })] }),
      entry('r3', { findings: [] }),
    ]);
    expect(run.columns.flatMap((c) => c.findings.map((f) => f.id)).sort()).toEqual(['f1', 'f2']);
    expect(run.groups).toHaveLength(1);
    expect(run.groups[0]!.members.map((m) => m.finding_id).sort()).toEqual(['f1', 'f2']);
    expect(run.conflicts).toHaveLength(1);
    expect(run.conflicts[0]!.is_conflict).toBe(true);
    expect(run.conflicts[0]!.takes.map((t) => t.state)).toEqual(['flagged', 'flagged', 'did_not_flag']);
  });
});
