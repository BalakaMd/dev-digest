import { describe, it, expect } from 'vitest';
import type { LLMProvider, RunCostSource, StructuredRequest, StructuredResult } from '@devdigest/shared';
import { MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';

/**
 * SPEC-10 AC-45 / EC-28 — `ReviewOutcome.costSource` aggregates the per-call cost source of every
 * model call of a run: `provider` when all calls were provider-reported, `estimate` when none were
 * (an absent tag counts as an estimate), `mixed` otherwise, and null when the run has no cost.
 */

const noFindings = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

const twoFileDiff =
  'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c\n' +
  'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c';

interface CallScript {
  costUsd: number | null;
  /** `undefined` = the provider returned no tag at all (OpenAI/Anthropic adapters, mocks). */
  costSource?: RunCostSource;
}

/** An LLM that answers call N with script[N] (one entry per model call). */
function scripted(script: CallScript[]): LLMProvider & { calls: number } {
  const llm = {
    id: 'openrouter' as const,
    calls: 0,
    async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
      const step = script[llm.calls++];
      if (!step) throw new Error('more model calls than scripted');
      return {
        data: noFindings as unknown as T,
        model: req.model,
        tokensIn: 1,
        tokensOut: 1,
        costUsd: step.costUsd,
        ...(step.costSource ? { costSource: step.costSource } : {}),
        raw: '',
        attempts: 1,
      };
    },
    async listModels() {
      return [];
    },
    async complete(): Promise<never> {
      throw new Error('not used');
    },
    async embed(): Promise<number[][]> {
      return [];
    },
  };
  return llm;
}

async function run(script: CallScript[], mapReduce: boolean) {
  const diff = await new MockGitClient(mapReduce ? { diff: twoFileDiff } : undefined).diff();
  const llm = scripted(script);
  const outcome = await reviewPullRequest({
    systemPrompt: 's',
    model: 'm',
    diff,
    llm,
    strategy: mapReduce ? 'map-reduce' : 'single-pass',
  });
  return { outcome, llm };
}

describe('reviewPullRequest — costSource (AC-45)', () => {
  it('single-pass: the cost source of the one call is the run cost source', async () => {
    const { outcome } = await run([{ costUsd: 0.01, costSource: 'provider' }], false);
    expect(outcome.mode).toBe('single-pass');
    expect(outcome.costUsd).toBeCloseTo(0.01);
    expect(outcome.costSource).toBe('provider');
  });

  it.each<{ name: string; script: CallScript[]; expected: RunCostSource }>([
    {
      name: 'every call provider-reported → provider',
      script: [
        { costUsd: 0.01, costSource: 'provider' },
        { costUsd: 0.02, costSource: 'provider' },
      ],
      expected: 'provider',
    },
    {
      name: 'no call provider-reported (tagged or untagged) → estimate',
      script: [{ costUsd: 0.01, costSource: 'estimate' }, { costUsd: 0.02 }],
      expected: 'estimate',
    },
    {
      name: 'one provider-reported call and one estimated call → mixed',
      script: [{ costUsd: 0.01, costSource: 'provider' }, { costUsd: 0.02, costSource: 'estimate' }],
      expected: 'mixed',
    },
  ])('map-reduce: $name', async ({ script, expected }) => {
    const { outcome, llm } = await run(script, true);
    expect(outcome.mode).toBe('map-reduce');
    expect(llm.calls).toBe(2);
    expect(outcome.costSource).toBe(expected);
  });

  it('a call that already reports mixed makes the run mixed (EC-28)', async () => {
    const { outcome } = await run(
      [
        { costUsd: 0.01, costSource: 'mixed' },
        { costUsd: 0.02, costSource: 'provider' },
      ],
      true,
    );
    expect(outcome.costSource).toBe('mixed');
  });

  it('a call without a cost makes the run unpriced: costUsd and costSource are both null', async () => {
    const { outcome } = await run(
      [
        { costUsd: 0.01, costSource: 'provider' },
        { costUsd: null, costSource: 'estimate' },
      ],
      true,
    );
    expect(outcome.costUsd).toBeNull();
    expect(outcome.costSource).toBeNull();
  });
});
