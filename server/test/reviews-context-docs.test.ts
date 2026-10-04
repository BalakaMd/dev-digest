import { describe, it, expect } from 'vitest';
import type { Finding } from '@devdigest/shared';
import { RunTrace } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import {
  CONTEXT_BUDGET_TOKENS,
  collectPaths,
  resolveContextDocs,
  filterCitations,
  toTraceContext,
  EMPTY_CONTEXT,
  type ReadResult,
} from '../src/modules/reviews/context-docs.js';
import { ContextDocError, readFailureReason } from '../src/adapters/context-docs/types.js';

/**
 * Pure run-assembly helpers (SPEC-01: AC-27, 33, 34, 36, 37, 38, 49). IO is
 * injected, so no DB, filesystem or network is involved.
 */

const ok = (path: string, content = `text of ${path}`, source: 'repo' | 'local' = 'repo'): ReadResult => ({
  ok: true,
  doc: { path, source, content },
});

describe('collectPaths (AC-27)', () => {
  it('puts the agent\'s documents first, then each skill\'s in link order, keeping the first occurrence', () => {
    const paths = collectPaths(
      ['docs/a.md', 'docs/b.md'],
      [{ contextDocs: ['docs/b.md', 'docs/c.md'] }, { contextDocs: ['docs/d.md', 'docs/a.md', 'docs/c.md'] }],
    );
    expect(paths).toEqual(['docs/a.md', 'docs/b.md', 'docs/c.md', 'docs/d.md']);
  });

  it('keeps each skill\'s own attachment order', () => {
    expect(collectPaths([], [{ contextDocs: ['z.md', 'a.md'] }, { contextDocs: ['m.md'] }])).toEqual([
      'z.md',
      'a.md',
      'm.md',
    ]);
  });

  it('returns nothing when neither the agent nor any skill attaches a document', () => {
    expect(collectPaths([], [])).toEqual([]);
    expect(collectPaths([], [{ contextDocs: [] }, { contextDocs: [] }])).toEqual([]);
  });
});

describe('resolveContextDocs', () => {
  const count = (_path: string, content: string) => content.length;

  it('injects every readable document in the given order with its source and token count (AC-27, AC-38)', async () => {
    const res = await resolveContextDocs({
      paths: ['a.md', 'b.md', 'c.md'],
      read: async (p) => ok(p, 'x'.repeat(p === 'a.md' ? 10 : p === 'b.md' ? 20 : 30), p === 'b.md' ? 'local' : 'repo'),
      count,
    });
    expect(res.injected.map((d) => [d.path, d.source, d.tokens])).toEqual([
      ['a.md', 'repo', 10],
      ['b.md', 'local', 20],
      ['c.md', 'repo', 30],
    ]);
    expect(res.blockTokens).toBe(60);
    expect(res.skipped).toEqual([]);
  });

  it('keeps prompt order even when a later document finishes reading first', async () => {
    const res = await resolveContextDocs({
      paths: ['slow.md', 'fast.md'],
      read: (p) =>
        new Promise((resolve) => setTimeout(() => resolve(ok(p)), p === 'slow.md' ? 30 : 0)),
      count,
    });
    expect(res.injected.map((d) => d.path)).toEqual(['slow.md', 'fast.md']);
  });

  it('reads all documents concurrently rather than one after another (NFR-2)', async () => {
    let inFlight = 0;
    let peak = 0;
    await resolveContextDocs({
      paths: ['a.md', 'b.md', 'c.md', 'd.md'],
      read: async (p) => {
        inFlight += 1;
        peak = Math.max(peak, inFlight);
        await new Promise((r) => setTimeout(r, 10));
        inFlight -= 1;
        return ok(p);
      },
      count,
    });
    expect(peak).toBe(4);
  });

  it('skips an unreadable document with its reason and carries on with the rest (AC-33)', async () => {
    const res = await resolveContextDocs({
      paths: ['a.md', 'gone.md', 'bin.md', 'c.md'],
      read: async (p) =>
        p === 'gone.md' ? { ok: false, reason: 'not_found' } : p === 'bin.md' ? { ok: false, reason: 'not_utf8' } : ok(p),
      count,
    });
    expect(res.injected.map((d) => d.path)).toEqual(['a.md', 'c.md']);
    expect(res.skipped).toEqual([
      { path: 'gone.md', reason: 'not_found' },
      { path: 'bin.md', reason: 'not_utf8' },
    ]);
  });

  it('a reader that throws is a skipped document, not a failed run (AC-33)', async () => {
    const res = await resolveContextDocs({
      paths: ['a.md', 'boom.md'],
      read: async (p) => {
        if (p === 'boom.md') throw new Error('EACCES: /Users/someone/clone/boom.md');
        return ok(p);
      },
      count,
    });
    expect(res.injected.map((d) => d.path)).toEqual(['a.md']);
    expect(res.skipped).toHaveLength(1);
    expect(res.skipped[0]!.path).toBe('boom.md');
    // the raw error text (with its absolute path) must not become the reason (AC-5)
    expect(JSON.stringify(res.skipped)).not.toContain('/Users/');
    expect(JSON.stringify(res.skipped)).not.toContain('EACCES');
  });

  describe('token budget (AC-34)', () => {
    it('uses an 8,000-token budget by default', () => {
      expect(CONTEXT_BUDGET_TOKENS).toBe(8000);
    });

    it('skips a whole document that would cross the budget and still tries the next ones', async () => {
      const sizes: Record<string, number> = { 'a.md': 5000, 'b.md': 4000, 'c.md': 2000, 'd.md': 1000 };
      const res = await resolveContextDocs({
        paths: Object.keys(sizes),
        read: async (p) => ok(p, 'x'.repeat(sizes[p]!)),
        count,
      });
      // a (5000) fits; b would reach 9000 > 8000 → skipped whole; c (7000) and d (8000) still fit
      expect(res.injected.map((d) => d.path)).toEqual(['a.md', 'c.md', 'd.md']);
      expect(res.skipped).toEqual([{ path: 'b.md', reason: 'over_budget' }]);
      expect(res.blockTokens).toBe(8000);
    });

    it('accepts a block of exactly 8,000 tokens and rejects the document that makes it 8,001', async () => {
      const exact = await resolveContextDocs({
        paths: ['a.md', 'b.md'],
        read: async (p) => ok(p, 'x'.repeat(4000)),
        count,
      });
      expect(exact.injected).toHaveLength(2);
      expect(exact.blockTokens).toBe(8000);

      const over = await resolveContextDocs({
        paths: ['a.md', 'b.md'],
        read: async (p) => ok(p, 'x'.repeat(p === 'a.md' ? 4000 : 4001)),
        count,
      });
      expect(over.injected.map((d) => d.path)).toEqual(['a.md']);
      expect(over.skipped).toEqual([{ path: 'b.md', reason: 'over_budget' }]);
    });

    it('a single document larger than the whole budget is skipped and the next one is injected', async () => {
      const res = await resolveContextDocs({
        paths: ['huge.md', 'small.md'],
        read: async (p) => ok(p, 'x'.repeat(p === 'huge.md' ? 9000 : 10)),
        count,
      });
      expect(res.injected.map((d) => d.path)).toEqual(['small.md']);
      expect(res.skipped).toEqual([{ path: 'huge.md', reason: 'over_budget' }]);
    });

    it('does not count an unreadable document towards the budget', async () => {
      const res = await resolveContextDocs({
        paths: ['gone.md', 'a.md'],
        read: async (p) => (p === 'gone.md' ? { ok: false, reason: 'not_found' } : ok(p, 'x'.repeat(8000))),
        count,
      });
      expect(res.injected.map((d) => d.path)).toEqual(['a.md']);
    });

    it('honours an explicit budget override and counts via the injected measure (wrapped block)', async () => {
      const seen: Array<[string, string]> = [];
      const res = await resolveContextDocs({
        paths: ['a.md'],
        read: async (p) => ok(p, 'hello'),
        count: (path, content) => {
          seen.push([path, content]);
          return wrapUntrusted(path, content).length;
        },
        budget: 10,
      });
      expect(seen).toEqual([['a.md', 'hello']]);
      expect(res.injected).toEqual([]);
      expect(res.skipped).toEqual([{ path: 'a.md', reason: 'over_budget' }]);
    });
  });

  it('returns an empty result for no paths without calling the reader', async () => {
    let calls = 0;
    const res = await resolveContextDocs({
      paths: [],
      read: async (p) => {
        calls += 1;
        return ok(p);
      },
      count,
    });
    expect(calls).toBe(0);
    expect(res).toEqual({ injected: [], skipped: [], blockTokens: 0 });
  });
});

describe('readFailureReason (AC-33 reasons, AC-5)', () => {
  it.each([
    ['not_found', 'not_found'],
    ['not_cloned', 'no_working_copy'],
    ['not_utf8', 'not_utf8'],
    ['too_large', 'too_large'],
    ['unsafe', 'unsafe_path'],
    ['invalid_path', 'unsafe_path'],
  ] as const)('maps store error %s to the fixed reason %s', (code, reason) => {
    expect(readFailureReason(new ContextDocError(code, { path: 'docs/a.md' }))).toBe(reason);
  });

  it('maps an unknown (non-store) error to not_found and never echoes its message', () => {
    expect(readFailureReason(new Error('EACCES: permission denied, open /Users/x/clone/a.md'))).toBe('not_found');
  });
});

describe('filterCitations (AC-49)', () => {
  const finding = (id: string, cited?: string[] | null): Finding => ({
    id,
    severity: 'WARNING',
    category: 'bug',
    title: `finding ${id}`,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'r',
    confidence: 0.9,
    ...(cited === undefined ? {} : { cited_docs: cited }),
  });

  it('removes cited paths that were not injected, keeps the finding and reports the removed path', () => {
    const { findings, removed } = filterCitations(
      [finding('f1', ['specs/a.md', 'specs/invented.md'])],
      ['specs/a.md'],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]!.cited_docs).toEqual(['specs/a.md']);
    expect(removed).toEqual(['specs/invented.md']);
  });

  it('keeps a finding whose every citation is removed (with an empty list)', () => {
    const { findings, removed } = filterCitations([finding('f1', ['docs/x.md'])], ['docs/y.md']);
    expect(findings).toHaveLength(1);
    expect(findings[0]!.id).toBe('f1');
    expect(findings[0]!.cited_docs).toEqual([]);
    expect(removed).toEqual(['docs/x.md']);
  });

  it('removes every citation when nothing was injected', () => {
    const { findings, removed } = filterCitations([finding('f1', ['docs/x.md'])], []);
    expect(findings[0]!.cited_docs).toEqual([]);
    expect(removed).toEqual(['docs/x.md']);
  });

  it('leaves findings without citations untouched', () => {
    const none = finding('f1');
    const nul = finding('f2', null);
    const out = filterCitations([none, nul], ['docs/x.md']);
    expect(out.findings[0]).toEqual(none);
    expect(out.findings[1]!.cited_docs).toBeNull();
    expect(out.removed).toEqual([]);
  });

  it('dedupes repeated citations and lists each removed path once', () => {
    const { findings, removed } = filterCitations(
      [finding('f1', ['a.md', 'a.md', 'bad.md']), finding('f2', ['bad.md', 'a.md'])],
      ['a.md'],
    );
    expect(findings.map((f) => f.cited_docs)).toEqual([['a.md'], ['a.md']]);
    expect(removed).toEqual(['bad.md']);
  });

  it('is an exact match: a path with a different case or an extra prefix is not injected', () => {
    const { findings, removed } = filterCitations(
      [finding('f1', ['Specs/A.md', './specs/a.md', 'specs/a.md'])],
      ['specs/a.md'],
    );
    expect(findings[0]!.cited_docs).toEqual(['specs/a.md']);
    expect(removed).toEqual(['Specs/A.md', './specs/a.md']);
  });

  it('does not mutate its input', () => {
    const input = [finding('f1', ['bad.md', 'ok.md'])];
    filterCitations(input, ['ok.md']);
    expect(input[0]!.cited_docs).toEqual(['bad.md', 'ok.md']);
  });
});

describe('toTraceContext (AC-37, AC-38, AC-78)', () => {
  it('is null when no document was read or skipped, so legacy traces stay unchanged', () => {
    expect(toTraceContext(EMPTY_CONTEXT)).toBeNull();
  });

  it('carries one entry per injected document, the block total and the skipped documents', () => {
    const ctx = toTraceContext({
      injected: [
        { path: 'specs/a.md', source: 'repo', content: 'SECRET BODY A', tokens: 12 },
        { path: 'docs/b.md', source: 'local', content: 'SECRET BODY B', tokens: 30 },
      ],
      skipped: [{ path: 'docs/c.md', reason: 'over_budget' }],
      blockTokens: 42,
    });
    expect(ctx).toEqual({
      docs: [
        { path: 'specs/a.md', source: 'repo', tokens: 12 },
        { path: 'docs/b.md', source: 'local', tokens: 30 },
      ],
      tokens: 42,
      skipped: [{ path: 'docs/c.md', reason: 'over_budget' }],
    });
    // never the document text
    expect(JSON.stringify(ctx)).not.toContain('SECRET BODY');
  });

  it('reports a run whose documents were all skipped (no docs, skipped listed)', () => {
    const ctx = toTraceContext({
      injected: [],
      skipped: [{ path: 'docs/gone.md', reason: 'not_found' }],
      blockTokens: 0,
    });
    expect(ctx).toEqual({ docs: [], tokens: 0, skipped: [{ path: 'docs/gone.md', reason: 'not_found' }] });
  });

  it('produces a value the persisted RunTrace contract accepts', () => {
    const context = toTraceContext({
      injected: [{ path: 'specs/a.md', source: 'repo', content: 'x', tokens: 3 }],
      skipped: [],
      blockTokens: 3,
    });
    const parsed = RunTrace.safeParse({
      config: { agent: 'A', version: 'v1', model: 'm', pr: 1, source: 'local' },
      stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0, findings: 0, grounding: '0/0 passed' },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: ['specs/a.md'],
      context,
      log: [],
    });
    expect(parsed.success).toBe(true);
  });
});

describe('override indicator of a local copy (SPEC-02 AC-17)', () => {
  const count = (_path: string, content: string) => content.length;
  const copy = (path: string, overridesRepo?: boolean): ReadResult => ({
    ok: true,
    doc: { path, source: 'local', content: `copy of ${path}`, ...(overridesRepo === undefined ? {} : { overridesRepo }) },
  });

  it('flows from the read through resolveContextDocs into the trace, only for the copy that overrides a repository document', async () => {
    const res = await resolveContextDocs({
      paths: ['docs/over.md', 'docs/plain-local.md', 'docs/repo.md', 'docs/false.md'],
      read: async (p) =>
        p === 'docs/over.md'
          ? copy(p, true)
          : p === 'docs/false.md'
            ? copy(p, false)
            : p === 'docs/repo.md'
              ? ok(p)
              : copy(p),
      count,
    });
    expect(res.injected.map((d) => [d.path, d.overridesRepo])).toEqual([
      ['docs/over.md', true],
      ['docs/plain-local.md', undefined],
      ['docs/repo.md', undefined],
      ['docs/false.md', undefined],
    ]);

    const context = toTraceContext(res)!;
    expect(context.docs.find((d) => d.path === 'docs/over.md')).toEqual({
      path: 'docs/over.md',
      source: 'local',
      tokens: 'copy of docs/over.md'.length,
      overrides_repo: true,
    });
    // omitted (not `false`) for every other document, so old and plain traces keep their shape
    for (const d of context.docs.filter((x) => x.path !== 'docs/over.md')) {
      expect(d).not.toHaveProperty('overrides_repo');
    }
    expect(RunTrace.shape.context.unwrap().unwrap().shape.docs.safeParse(context.docs).success).toBe(true);
  });
});
