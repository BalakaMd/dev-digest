import { describe, it, expect } from 'vitest';
import type { LLMProvider, StructuredResult } from '@devdigest/shared';
import { MockLLMProvider, MockGitClient } from '../../server/src/adapters/mocks.js';
import { reviewPullRequest } from '../src/index.js';
import type { PromptIntent } from '../src/prompt.js';

/**
 * Engine-level test for reviewPullRequest (the core lifted out of the server's
 * runOneAgent). Uses the server's mock LLM + git so we exercise the real
 * assemble → completeStructured → reduce → grounding pipeline with no DB/SSE.
 */
describe('reviewPullRequest (engine)', () => {
  // One grounded finding (line 11 is in the MockGitClient diff) + one
  // hallucinated finding (line 999) the grounding gate must drop.
  const fixture = {
    verdict: 'request_changes',
    summary: 'secret key committed',
    score: 38,
    findings: [
      {
        id: 'f1',
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'sk_live in diff',
        confidence: 0.98,
        kind: 'finding',
      },
      {
        id: 'f-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom finding on a line not in the diff',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not real',
        confidence: 0.3,
        kind: 'finding',
      },
    ],
  };

  it('single-pass: assembles, grounds, drops the hallucinated finding', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();

    const events: string[] = [];
    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      task: 'Review PR #482',
      onEvent: (e) => events.push(e.msg),
    });

    expect(outcome.mode).toBe('single-pass');
    expect(outcome.grounding).toBe('1/2 passed');
    expect(outcome.review.findings).toHaveLength(1);
    expect(outcome.review.findings[0]!.start_line).toBe(11);
    expect(outcome.dropped).toHaveLength(1);
    // Score is derived from the SURVIVING findings, not the model's self-reported
    // 38: one CRITICAL remains after grounding ⇒ 100 − 35 = 65.
    expect(outcome.review.score).toBe(65);
    // progress is surfaced (server bridges this onto SSE; runner logs it)
    expect(events.some((m) => m.includes('Citation grounding'))).toBe(true);
  });

  it('score is deterministic from findings: a clean approve scores 100', async () => {
    // Model "approves" but reports a nonsense low score (the cheap-model bug).
    // The engine must ignore that and score the zero findings as a perfect 100.
    const clean = { verdict: 'approve', summary: 'looks good', score: 10, findings: [] };
    const llm = new MockLLMProvider('openai', { structured: clean });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'deepseek/deepseek-v4-flash',
      diff,
      llm,
      task: 'Review PR #5',
    });

    expect(outcome.review.findings).toHaveLength(0);
    expect(outcome.review.score).toBe(100);
  });

  it('checkCancelled throwing aborts before the LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: fixture });
    const diff = await new MockGitClient().diff();
    await expect(
      reviewPullRequest({
        systemPrompt: 's',
        model: 'gpt-4.1',
        diff,
        llm,
        checkCancelled: () => {
          throw new Error('cancelled');
        },
      }),
    ).rejects.toThrow('cancelled');
  });

  it('forwards sessionId to every LLM call (OpenRouter session grouping)', async () => {
    const seen: (string | undefined)[] = [];
    const recorder: LLMProvider = {
      id: 'openrouter',
      async completeStructured<T>(req): Promise<StructuredResult<T>> {
        seen.push(req.sessionId);
        return {
          data: fixture as unknown as T,
          model: req.model,
          tokensIn: 0,
          tokensOut: 0,
          costUsd: 0,
          raw: '',
          attempts: 1,
        };
      },
      async listModels() {
        return [];
      },
      async complete() {
        throw new Error('not used');
      },
      async embed() {
        return [];
      },
    };
    const diff = await new MockGitClient().diff();
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: recorder, sessionId: 'sess-abc' });
    expect(seen.length).toBeGreaterThan(0);
    expect(seen.every((s) => s === 'sess-abc')).toBe(true);
  });
});

describe('reviewPullRequest (engine) — scope filter', () => {
  // Both findings cite line 11, which IS in the MockGitClient diff hunk, so
  // grounding keeps them both; the scope filter then acts on what grounding
  // kept.
  const scopeFixture = {
    verdict: 'request_changes',
    summary: 'two grounded findings, one out of scope',
    score: 40,
    findings: [
      {
        id: 'in-scope',
        severity: 'WARNING',
        category: 'bug',
        title: 'in-scope finding',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'relevant to the stated intent',
        confidence: 0.9,
        kind: 'finding',
        scope: 'in',
      },
      {
        id: 'out-of-scope-critical',
        severity: 'CRITICAL',
        category: 'security',
        title: 'out-of-scope critical finding',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'a real defect, but outside the stated scope',
        confidence: 0.95,
        kind: 'finding',
        scope: 'out',
      },
      {
        id: 'out-of-scope-warning',
        severity: 'WARNING',
        category: 'style',
        title: 'out-of-scope warning finding',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'stylistic, outside the stated scope',
        confidence: 0.5,
        kind: 'finding',
        scope: 'out',
      },
    ],
  };

  const intent: PromptIntent = {
    summary: 'Adds rate limiting.',
    in_scope: ['Rate limiter'],
    out_of_scope: ['Secret rotation'],
    confidence: 'medium',
    unavailable: [],
  };

  it('with an intent: filters out-of-scope findings after grounding, keeps one CRITICAL signal', async () => {
    const llm = new MockLLMProvider('openai', { structured: scopeFixture });
    const diff = await new MockGitClient().diff();
    const events: string[] = [];

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
      intent,
      onEvent: (e) => events.push(e.msg),
    });

    // Grounding: all three findings cite a real line (11), none dropped by grounding.
    expect(outcome.dropped).toHaveLength(0);
    // Scope: in-scope + the CRITICAL out-of-scope signal survive; the WARNING is dropped.
    expect(outcome.review.findings.map((f) => f.id).sort()).toEqual(
      ['in-scope', 'out-of-scope-critical'].sort(),
    );
    expect(outcome.scopeSignal?.id).toBe('out-of-scope-critical');
    expect(outcome.scopeDropped).toHaveLength(1);
    expect(outcome.scopeDropped[0]!.finding.id).toBe('out-of-scope-warning');
    expect(outcome.scopeDropped[0]!.reason).toBe('out of PR scope — one signal already kept');
    // Score recomputed from the FINAL set (in-scope WARNING + the CRITICAL signal),
    // not from the pre-scope-filter three findings: 100 - 35 (CRITICAL) - 12 (WARNING) = 53.
    expect(outcome.review.score).toBe(53);
    expect(events.some((m) => m.includes('Scope filter: kept 2, dropped 1'))).toBe(true);
    // The prompt actually carried the intent section.
    expect(outcome.assembly.intent).toContain('## PR intent');
  });

  it('without an intent: scope is normalised to null on every kept finding, no scope filtering happens', async () => {
    const llm = new MockLLMProvider('openai', { structured: scopeFixture });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({
      systemPrompt: 'security reviewer',
      model: 'gpt-4.1',
      diff,
      llm,
    });

    // No scope filtering ran: all three grounded findings are kept.
    expect(outcome.review.findings).toHaveLength(3);
    expect(outcome.review.findings.every((f) => f.scope === null)).toBe(true);
    expect(outcome.scopeDropped).toHaveLength(0);
    expect(outcome.scopeSignal).toBeNull();
    expect(outcome.assembly.intent ?? null).toBeNull();
  });
});

describe('reviewPullRequest (engine) — project context (AC-31, AC-48)', () => {
  const specs = [
    { path: 'specs/api-rules.md', content: 'The `api/` module must not import `db/` directly.' },
    { path: 'docs/security.md', content: 'Never commit secrets.' },
  ];

  const twoFileDiff =
    'diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c\n' +
    'diff --git a/src/b.ts b/src/b.ts\n--- a/src/b.ts\n+++ b/src/b.ts\n@@ -1,2 +1,3 @@\n a\n+b\n c';

  const noFindings = { verdict: 'approve', summary: 'ok', score: 100, findings: [] };

  function structuredCalls(llm: MockLLMProvider) {
    return llm.calls.filter((c) => c.method === 'completeStructured');
  }

  it('single-pass: attaching documents does not add an LLM call, and the documents reach the prompt', async () => {
    const diff = await new MockGitClient().diff();
    const plain = new MockLLMProvider('openai', { structured: noFindings });
    const withDocs = new MockLLMProvider('openai', { structured: noFindings });

    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: plain });
    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: withDocs, specs });

    expect(structuredCalls(plain)).toHaveLength(1);
    expect(structuredCalls(withDocs)).toHaveLength(structuredCalls(plain).length);
    expect(withDocs.calls).toHaveLength(plain.calls.length);

    const sent = (structuredCalls(withDocs)[0]!.req as { messages: { role: string; content: string }[] })
      .messages;
    expect(sent[1]!.content).toContain('## Project context');
    expect(sent[1]!.content).toContain('<untrusted source="specs/api-rules.md">');
    expect(sent[1]!.content).toContain('<untrusted source="docs/security.md">');
    // the trace assembly carries the wrapped documents, in order
    const assembled = outcome.assembly.specs as string;
    expect(assembled.indexOf('specs/api-rules.md')).toBeLessThan(assembled.indexOf('docs/security.md'));
  });

  it('map-reduce: the call count is one per file with or without documents', async () => {
    const diff = await new MockGitClient({ diff: twoFileDiff }).diff();
    const plain = new MockLLMProvider('openai', { structured: noFindings });
    const withDocs = new MockLLMProvider('openai', { structured: noFindings });

    const a = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: plain, strategy: 'map-reduce' });
    const b = await reviewPullRequest({
      systemPrompt: 's',
      model: 'm',
      diff,
      llm: withDocs,
      strategy: 'map-reduce',
      specs,
    });

    expect(a.mode).toBe('map-reduce');
    expect(b.mode).toBe('map-reduce');
    expect(structuredCalls(plain)).toHaveLength(2);
    expect(structuredCalls(withDocs)).toHaveLength(2);
    // every per-file prompt carries the documents
    for (const c of structuredCalls(withDocs)) {
      const msgs = (c.req as { messages: { content: string }[] }).messages;
      expect(msgs[1]!.content).toContain('<untrusted source="specs/api-rules.md">');
    }
  });

  it('without documents the prompt sent to the model has no Project context section', async () => {
    const diff = await new MockGitClient().diff();
    const llm = new MockLLMProvider('openai', { structured: noFindings });
    const withEmpty = new MockLLMProvider('openai', { structured: noFindings });

    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm });
    await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm: withEmpty, specs: [] });

    const sentOf = (m: MockLLMProvider) =>
      (structuredCalls(m)[0]!.req as { messages: unknown[] }).messages;
    expect(sentOf(withEmpty)).toEqual(sentOf(llm));
    expect(JSON.stringify(sentOf(llm))).not.toContain('Project context');
  });

  const citedFixture = {
    verdict: 'request_changes',
    summary: 'api imports db',
    score: 50,
    findings: [
      {
        id: 'cited',
        severity: 'WARNING',
        category: 'bug',
        title: 'api imports db directly',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'violates specs/api-rules.md',
        confidence: 0.9,
        kind: 'finding',
        scope: 'in',
        cited_docs: ['specs/api-rules.md'],
      },
      {
        id: 'cited-out-of-scope-critical',
        severity: 'CRITICAL',
        category: 'security',
        title: 'secret in code',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'docs/security.md forbids it',
        confidence: 0.95,
        kind: 'finding',
        scope: 'out',
        cited_docs: ['docs/security.md', 'specs/api-rules.md'],
      },
      {
        id: 'uncited',
        severity: 'SUGGESTION',
        category: 'style',
        title: 'no document involved',
        file: 'src/config.ts',
        start_line: 11,
        end_line: 11,
        rationale: 'style',
        confidence: 0.4,
        kind: 'finding',
        scope: 'in',
      },
      {
        id: 'cited-hallucinated',
        severity: 'WARNING',
        category: 'bug',
        title: 'phantom line',
        file: 'src/config.ts',
        start_line: 999,
        end_line: 999,
        rationale: 'not in the diff',
        confidence: 0.3,
        kind: 'finding',
        cited_docs: ['specs/api-rules.md'],
      },
    ],
  };

  it('cited_docs survives grounding unchanged; the gate still drops an ungrounded finding that cites', async () => {
    const llm = new MockLLMProvider('openai', { structured: citedFixture });
    const diff = await new MockGitClient().diff();

    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, specs });

    const byId = Object.fromEntries(outcome.review.findings.map((f) => [f.id, f]));
    expect(Object.keys(byId).sort()).toEqual(['cited', 'cited-out-of-scope-critical', 'uncited']);
    expect(byId['cited']!.cited_docs).toEqual(['specs/api-rules.md']);
    expect(byId['cited-out-of-scope-critical']!.cited_docs).toEqual([
      'docs/security.md',
      'specs/api-rules.md',
    ]);
    expect(byId['uncited']!.cited_docs ?? null).toBeNull();
    expect(outcome.dropped.map((d) => d.finding.id)).toEqual(['cited-hallucinated']);
  });

  it('cited_docs survives the scope filter, including on the kept out-of-scope signal', async () => {
    const llm = new MockLLMProvider('openai', { structured: citedFixture });
    const diff = await new MockGitClient().diff();
    const intent = {
      summary: 'Adds config.',
      in_scope: ['config'],
      out_of_scope: [],
      confidence: 'medium' as const,
      unavailable: [],
    };

    const outcome = await reviewPullRequest({ systemPrompt: 's', model: 'm', diff, llm, specs, intent });

    expect(outcome.scopeSignal?.id).toBe('cited-out-of-scope-critical');
    const byId = Object.fromEntries(outcome.review.findings.map((f) => [f.id, f]));
    expect(byId['cited']!.cited_docs).toEqual(['specs/api-rules.md']);
    expect(byId['cited-out-of-scope-critical']!.cited_docs).toEqual([
      'docs/security.md',
      'specs/api-rules.md',
    ]);
  });
});
