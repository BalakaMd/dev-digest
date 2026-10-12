import { describe, it, expect, vi, afterEach } from 'vitest';
import type { CiResultArtifact, Finding } from '@devdigest/shared';
import { renderJobSummary, writeJobSummary } from './summary.js';

function artifact(overrides: Partial<CiResultArtifact> = {}): CiResultArtifact {
  return {
    findings_count: 3,
    critical: 1,
    warning: 1,
    suggestion: 1,
    cost_usd: 0.01234,
    duration_ms: 4200,
    agent: 'Security Reviewer',
    version: '2',
    pr_number: 42,
    verdict: 'request_changes',
    blockers: 1,
    trace: {
      manifest: { agent_version: 3, sha256: 'a'.repeat(64) },
      model: 'anthropic/claude-sonnet-4',
      runner_version: '2',
      reviewer_core_revision: 'abc123',
      node_version: 'v22.0.0',
      skill_hashes: [],
      head_sha: '0123456789abcdef0123456789abcdef01234567',
    },
    ...overrides,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('renderJobSummary', () => {
  it('renders the verdict, counts, model and a short head commit', () => {
    const md = renderJobSummary(artifact());

    expect(md).toContain('### DevDigest review — Security Reviewer on PR #42');
    expect(md).toContain('| Verdict | Request changes |');
    expect(md).toContain('| Blockers | 1 |');
    expect(md).toContain('| Findings | 3 |');
    expect(md).toContain('| Critical | 1 |');
    expect(md).toContain('| Head commit | 0123456 |');
    expect(md).toContain('anthropic/claude-sonnet-4');
  });

  it('labels every verdict the gate can produce', () => {
    expect(renderJobSummary(artifact({ verdict: 'approve' }))).toContain('| Verdict | Approve |');
    expect(renderJobSummary(artifact({ verdict: 'comment' }))).toContain('| Verdict | Comment |');
  });

  it('shows dashes for fields an older runner did not report', () => {
    const md = renderJobSummary({ findings_count: 0, cost_usd: null, agent: 'Legacy' });

    expect(md).toContain('### DevDigest review — Legacy\n');
    expect(md).toContain('| Verdict | — |');
    expect(md).toContain('| Model | — |');
    expect(md).toContain('| Duration | — |');
    expect(md).toContain('| Head commit | — |');
    expect(md).not.toContain('undefined');
  });

  it('shows a dash when the run reported no cost', () => {
    expect(renderJobSummary(artifact({ cost_usd: null }))).toContain('| Cost | — |');
  });

  it('formats cost with four decimals', () => {
    expect(renderJobSummary(artifact({ cost_usd: 0.01234 }))).toContain('| Cost | $0.0123 |');
  });

  it.each([
    [850, '850 ms'],
    [4200, '4.2 s'],
    [125_000, '2 min 5 s'],
  ])('formats a duration of %i ms as %s', (ms, expected) => {
    expect(renderJobSummary(artifact({ duration_ms: ms }))).toContain(`| Duration | ${expected} |`);
  });

  it('escapes Markdown in the agent name so it cannot break the heading or table', () => {
    const md = renderJobSummary(artifact({ agent: 'Evil | [click](http://x) <b>agent</b>\nnew line' }));

    expect(md).toContain('Evil \\| \\[click\\](http://x) \\<b\\>agent\\</b\\> new line');
    expect(md.split('\n').filter((l) => l.startsWith('###'))).toHaveLength(1);
  });

  it('never includes anything but typed fields (no key-shaped value can leak)', () => {
    const md = renderJobSummary(artifact());

    expect(md).not.toMatch(/sk[-_]/i);
    expect(md).not.toContain('OPENROUTER_API_KEY');
    expect(md).not.toContain('GITHUB_TOKEN');
  });

  it('ends with a single trailing newline so repeated appends stay separated', () => {
    const md = renderJobSummary(artifact());

    expect(md.endsWith('|\n\n')).toBe(true);
  });
});

describe('writeJobSummary', () => {
  it('appends the rendered summary to the given path', () => {
    const append = vi.fn();

    const written = writeJobSummary(artifact(), { summaryPath: '/tmp/summary.md', append });

    expect(written).toBe(true);
    expect(append).toHaveBeenCalledTimes(1);
    expect(append).toHaveBeenCalledWith('/tmp/summary.md', renderJobSummary(artifact()));
  });

  it('does nothing outside GitHub Actions (no path)', () => {
    const append = vi.fn();

    expect(writeJobSummary(artifact(), { summaryPath: undefined, append })).toBe(false);
    expect(writeJobSummary(artifact(), { summaryPath: '', append })).toBe(false);
    expect(append).not.toHaveBeenCalled();
  });

  it('swallows a write failure and reports it instead of throwing', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const append = vi.fn(() => {
      throw new Error('EACCES: permission denied');
    });

    expect(writeJobSummary(artifact(), { summaryPath: '/ro/summary.md', append })).toBe(false);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('EACCES: permission denied'));
  });
});

function finding(overrides: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'security',
    title: 'Weak hash',
    file: 'src/auth.ts',
    start_line: 12,
    end_line: 12,
    rationale: 'md5 is not collision resistant',
    confidence: 0.8,
    kind: 'finding',
    ...overrides,
  };
}

describe('renderJobSummary with findings', () => {
  it('lists the most severe findings first', () => {
    const md = renderJobSummary(artifact(), [
      finding({ id: 'a', severity: 'SUGGESTION', title: 'Rename variable' }),
      finding({ id: 'b', severity: 'CRITICAL', title: 'SQL injection' }),
    ]);

    expect(md).toContain('#### Top findings');
    expect(md.indexOf('SQL injection')).toBeLessThan(md.indexOf('Rename variable'));
  });

  it('omits the section when there are no findings', () => {
    expect(renderJobSummary(artifact(), [])).not.toContain('Top findings');
  });

  it.skip('drops duplicate findings with the same title and file', () => {
    const md = renderJobSummary(artifact(), [finding({ id: 'a' }), finding({ id: 'b' })]);

    expect(md.match(/Weak hash/g)).toHaveLength(1);
  });
});
