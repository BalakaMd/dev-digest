import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { PrBrief, PrBriefResponse } from '@devdigest/shared';

/**
 * SPEC-04 contract (AC-22): the stored brief never embeds `intent`, `blast` or
 * `history`, and the server and client copies of the contract stay identical.
 */

const BRIEF = {
  summary: 'Adds a limiter.',
  risks: [{ kind: 'behavior', title: 't', explanation: 'e', severity: 'low', file_refs: ['src/a.ts'] }],
  review_focus: [{ file: 'src/a.ts', line: 3, reason: 'r' }],
  head_sha: 'sha-1',
  generated_at: '2026-10-04T12:00:00.000Z',
  language: 'English',
  provider: 'openai',
  model: 'gpt-test',
  tokens_in: 1,
  tokens_out: 1,
  cost_usd: 0.01,
  input_tokens: 100,
  missing_inputs: [],
  shortened_inputs: [],
};

describe('PrBrief contract (AC-22)', () => {
  it('has no intent / blast / history keys, and strips them from a stored object', () => {
    for (const key of ['intent', 'blast', 'history']) {
      expect(Object.keys(PrBrief.shape)).not.toContain(key);
    }
    const parsed = PrBrief.parse({ ...BRIEF, intent: { summary: 'x' }, blast: {}, history: [] });
    expect(parsed).not.toHaveProperty('intent');
    expect(parsed).not.toHaveProperty('blast');
    expect(parsed).not.toHaveProperty('history');
    expect(PrBriefResponse.parse({ brief: null, stale: false })).toEqual({ brief: null, stale: false });
  });

  it('server and client copies of contracts/brief.ts are byte-identical', () => {
    const rel = 'vendor/shared/contracts/brief.ts';
    const server = readFileSync(path.resolve(__dirname, '../src', rel), 'utf8');
    const client = readFileSync(path.resolve(__dirname, '../../client/src', rel), 'utf8');
    expect(client).toBe(server);
  });
});
