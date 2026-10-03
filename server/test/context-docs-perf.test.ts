import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { FsContextDocStore } from '../src/adapters/context-docs/index.js';
import { DEFAULT_CONTEXT_GLOBS } from '../src/adapters/context-docs/glob.js';
import { TiktokenTokenizer } from '../src/adapters/tokenizer/index.js';
import { resolveContextDocs } from '../src/modules/reviews/context-docs.js';

/**
 * NFR-2 — the document list returns within 1 s for 1,000 matching documents, and
 * reading + assembling an attached set within the limits (20 documents of up to
 * 65,536 bytes) adds at most 200 ms to a run. Uses the server's real tokenizer
 * and deterministic prose-like text (not one repeated line, which tokenises
 * unrealistically fast).
 */

const WORDS = [
  'service', 'repository', 'module', 'import', 'interface', 'adapter', 'container', 'request',
  'response', 'schema', 'validate', 'handler', 'policy', 'security', 'token', 'budget', 'review',
  'finding', 'prompt', 'context', 'agent', 'skill', 'trace', 'delimiter', 'untrusted', 'invariant',
  'database', 'boundary', 'layer', 'ring',
];

function makeText(bytes: number, seed: number): string {
  let s = seed;
  const rnd = () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  let out = '';
  while (out.length < bytes) {
    out += WORDS[Math.floor(rnd() * WORDS.length)] + (rnd() < 0.1 ? '.\n' : ' ');
    if (rnd() < 0.05) out += `${Math.floor(rnd() * 1e6)} `;
  }
  return out.slice(0, bytes);
}

describe('context-document performance (NFR-2)', () => {
  let base: string;
  let store: FsContextDocStore;
  const tokenizer = new TiktokenTokenizer();
  const scope = { repoId: 'perf-repo', repo: { owner: 'acme', name: 'big' } };

  beforeAll(() => {
    base = mkdtempSync(join(tmpdir(), 'devdigest-ctx-perf-'));
    const docs = join(base, 'clone', 'docs');
    mkdirSync(docs, { recursive: true });
    for (let i = 0; i < 1000; i++) writeFileSync(join(docs, `d${String(i).padStart(4, '0')}.md`), makeText(4000, i + 1));
    for (let i = 0; i < 20; i++) writeFileSync(join(docs, `big${i}.md`), makeText(65_536, 10_000 + i));
    store = new FsContextDocStore({
      globs: DEFAULT_CONTEXT_GLOBS,
      contextDir: join(base, 'ctx'),
      clonePathFor: () => join(base, 'clone'),
      countTokens: (t) => tokenizer.count(t),
    });
    tokenizer.count('warm up the encoder'); // one-time BPE load is a server-start cost, not per-run
  });
  afterAll(() => rmSync(base, { recursive: true, force: true }));

  it('lists 1,020 matching documents (capped at 1,000) with token counts in under 1 s, cold cache', async () => {
    const start = performance.now();
    const res = await store.list(scope);
    const ms = performance.now() - start;
    console.info(`[perf] cold list of ${res.docs.length} documents: ${Math.round(ms)} ms`);

    expect(res.truncated).toBe(true);
    expect(res.docs).toHaveLength(1000);
    expect(res.docs.every((d) => d.tokens !== null && d.tokens > 0)).toBe(true);
    expect(ms).toBeLessThan(1000);
  });

  it('reads and assembles 20 documents of 64 KiB in under 200 ms', async () => {
    const paths = Array.from({ length: 20 }, (_, i) => `docs/big${i}.md`);
    const start = performance.now();
    const res = await resolveContextDocs({
      paths,
      read: async (path) => {
        const doc = await store.read(scope, path);
        return { ok: true, doc: { path, source: doc.source, content: doc.content } };
      },
      count: (path, content) => tokenizer.count(wrapUntrusted(path, content)),
      budget: Number.MAX_SAFE_INTEGER, // measure the work, not the 8,000-token cut-off
    });
    const ms = performance.now() - start;
    console.info(`[perf] read + count of 20 x 64 KiB: ${Math.round(ms)} ms`);

    expect(res.injected).toHaveLength(20);
    expect(res.skipped).toEqual([]);
    expect(ms).toBeLessThan(200);
  });
});
