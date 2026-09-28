import { describe, it, expect } from 'vitest';
import type { PrIntentRecord, PromptAssembly } from '@devdigest/shared';
import { taskLine, toPromptIntent, withIntentStats } from '../src/modules/reviews/helpers.js';

/**
 * Unit coverage for the review task-line. The key invariant: our trusted
 * instruction always tells the model to review the whole diff and never
 * withhold a security/correctness finding — no matter what the PR text claims.
 */

describe('taskLine', () => {
  const pull = { number: 3, title: 'test: vulnerable fixture', author: 'burnjohn' } as never;

  it('names the PR being reviewed', () => {
    const line = taskLine(pull);
    expect(line).toContain('#3');
    expect(line).toContain('test: vulnerable fixture');
  });

  it('keeps the non-negotiable "never withhold security" rule', () => {
    const line = taskLine(pull);
    expect(line).toMatch(/never .*withhold .*(or downgrade )?.*security/i);
    expect(line).toMatch(/review the entire diff/i);
  });
});

const INTENT_RECORD: PrIntentRecord = {
  pr_id: 'pr-1',
  summary: 'Adds rate limiting.',
  in_scope: ['A token-bucket limiter'],
  out_of_scope: ['Auth changes'],
  confidence: 'high',
  sources: [
    { kind: 'title', ref: 'title', status: 'used', bytes: 10, detail: null },
    { kind: 'plan', ref: 'docs/plan.md', status: 'unreachable', bytes: null, detail: 'not found' },
    { kind: 'link', ref: 'acme.atlassian.net/browse/X-1', status: 'unsupported', bytes: null, detail: null },
  ],
  head_sha: 'sha-1',
  stale: false,
  provider: 'openrouter',
  model: 'deepseek/deepseek-v4-flash',
  tokens_in: 100,
  tokens_out: 50,
  cost_usd: 0.001,
  derived_at: '2026-01-01T00:00:00.000Z',
};

describe('toPromptIntent', () => {
  it('maps summary/scope/confidence through and formats unavailable refs as "ref (status)"', () => {
    const promptIntent = toPromptIntent(INTENT_RECORD);
    expect(promptIntent).toEqual({
      summary: 'Adds rate limiting.',
      in_scope: ['A token-bucket limiter'],
      out_of_scope: ['Auth changes'],
      confidence: 'high',
      unavailable: ['docs/plan.md (unreachable)', 'acme.atlassian.net/browse/X-1 (unsupported)'],
    });
  });

  it('used/truncated sources never appear in unavailable', () => {
    const record = { ...INTENT_RECORD, sources: [{ kind: 'title' as const, ref: 'title', status: 'used' as const, bytes: 1, detail: null }] };
    expect(toPromptIntent(record).unavailable).toEqual([]);
  });
});

describe('withIntentStats', () => {
  const base: PromptAssembly = { system: 's', user: 'u' };

  it('attaches intent_tokens only when an intent section is present', () => {
    const withIntent = withIntentStats({ ...base, intent: '## PR intent\n…' }, (t) => t.length);
    expect(withIntent.intent_tokens).toBe('## PR intent\n…'.length);
  });

  it('leaves the assembly untouched when there is no intent section', () => {
    const count = (t: string) => t.length;
    expect(withIntentStats(base, count)).toEqual(base);
  });
});
