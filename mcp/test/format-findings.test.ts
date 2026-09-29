import { describe, it, expect } from 'vitest';
import { selectLatestReviewPerAgent, projectFindings, renderFindingsText } from '../src/format/findings.js';
import type { ReviewRecord } from '@devdigest/shared';

function finding(overrides: Partial<ReviewRecord['findings'][number]> = {}): ReviewRecord['findings'][number] {
  return {
    id: 'f1',
    review_id: 'r1',
    severity: 'WARNING',
    category: 'bug',
    title: 'Some finding',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'because',
    suggestion: null,
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'rev-1',
    pr_id: 'pr-1',
    agent_id: 'agent-1',
    run_id: 'run-1',
    agent_name: 'General Reviewer',
    kind: 'review',
    verdict: 'comment',
    summary: 'ok',
    score: 80,
    model: 'x',
    created_at: '2026-06-01T00:00:00Z',
    findings: [],
    ...overrides,
  };
}

describe('selectLatestReviewPerAgent', () => {
  it('keeps only the first (newest) review per agent, skipping summaries', () => {
    const reviews = [
      review({ id: 'rev-2', agent_id: 'agent-1', created_at: '2026-06-02T00:00:00Z' }),
      review({ id: 'rev-1', agent_id: 'agent-1', created_at: '2026-06-01T00:00:00Z' }),
      review({ id: 'rev-3', agent_id: 'agent-2', created_at: '2026-06-01T00:00:00Z' }),
      review({ id: 'rev-4', agent_id: 'agent-2', kind: 'summary' }),
    ];
    const result = selectLatestReviewPerAgent(reviews);
    expect(result.map((r) => r.id)).toEqual(['rev-2', 'rev-3']);
  });
});

describe('projectFindings', () => {
  it('sorts by severity, then file, then start_line, then id', () => {
    const reviews = [
      review({
        findings: [
          finding({ id: 'c', severity: 'SUGGESTION', file: 'b.ts', start_line: 1 }),
          finding({ id: 'a', severity: 'CRITICAL', file: 'a.ts', start_line: 5 }),
          finding({ id: 'b', severity: 'CRITICAL', file: 'a.ts', start_line: 1 }),
        ],
      }),
    ];
    const projection = projectFindings(reviews);
    expect(projection.findings.map((f) => f.title)).toHaveLength(3);
    expect(projection.findings.map((f) => f.severity)).toEqual(['CRITICAL', 'CRITICAL', 'SUGGESTION']);
  });

  it('filters by min_severity', () => {
    const reviews = [
      review({
        findings: [finding({ id: 'a', severity: 'CRITICAL' }), finding({ id: 'b', severity: 'SUGGESTION' })],
      }),
    ];
    const projection = projectFindings(reviews, { minSeverity: 'WARNING' });
    expect(projection.total).toBe(1);
    expect(projection.findings[0]!.severity).toBe('CRITICAL');
  });

  it('hides dismissed findings and counts them separately', () => {
    const reviews = [
      review({
        findings: [
          finding({ id: 'a', dismissed_at: '2026-06-01T00:00:00Z' }),
          finding({ id: 'b' }),
        ],
      }),
    ];
    const projection = projectFindings(reviews);
    expect(projection.total).toBe(1);
    expect(projection.hiddenDismissed).toBe(1);
  });

  it('paginates with offset/limit and sets nextOffset', () => {
    const findings = Array.from({ length: 5 }, (_, i) => finding({ id: `f${i}`, start_line: i }));
    const reviews = [review({ findings })];
    const page1 = projectFindings(reviews, { limit: 2, offset: 0 });
    expect(page1.returned).toBe(2);
    expect(page1.nextOffset).toBe(2);
    const page3 = projectFindings(reviews, { limit: 2, offset: 4 });
    expect(page3.returned).toBe(1);
    expect(page3.nextOffset).toBeNull();
  });

  it('omits id/rationale/confidence in concise mode, includes them detailed', () => {
    const reviews = [review({ findings: [finding({ id: 'a' })] })];
    const concise = projectFindings(reviews);
    expect(concise.findings[0]!.id).toBeUndefined();
    expect(concise.findings[0]!.rationale).toBeUndefined();

    const detailed = projectFindings(reviews, { detailed: true });
    expect(detailed.findings[0]!.id).toBe('a');
    expect(detailed.findings[0]!.rationale).toBe('because');
    expect(detailed.findings[0]!.state).toBe('open');
  });

  it('shrinks the page rather than exceeding the output budget', () => {
    const bigRationale = 'x'.repeat(2000);
    const findings = Array.from({ length: 30 }, (_, i) =>
      finding({ id: `f${i}`, start_line: i, rationale: bigRationale }),
    );
    const reviews = [review({ findings })];
    const projection = projectFindings(reviews, { detailed: true, limit: 30 });
    expect(projection.returned).toBeLessThan(30);
    expect(projection.nextOffset).not.toBeNull();
  });
});

describe('renderFindingsText', () => {
  it('renders one line per finding plus a pagination hint', () => {
    const findings = Array.from({ length: 3 }, (_, i) => finding({ id: `f${i}`, start_line: i }));
    const reviews = [review({ findings })];
    const projection = projectFindings(reviews, { limit: 2 });
    const text = renderFindingsText(projection);
    expect(text.split('\n')).toHaveLength(3); // 2 findings + 1 hint
    expect(text).toContain('offset=2');
  });

  it('says "no findings" when there are none', () => {
    const projection = projectFindings([review({ findings: [] })]);
    expect(renderFindingsText(projection)).toMatch(/no findings/i);
  });
});
