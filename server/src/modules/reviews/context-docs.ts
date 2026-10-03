/**
 * Project-context documents for a review run — pure helpers (IO is injected).
 * The run executor reads the attached documents once, before any LLM call, and
 * the engine receives only `{path, content}` pairs. Paths here are always
 * repo-relative; nothing carries an absolute filesystem path (AC-5).
 */
import type { Finding, RunTrace } from '@devdigest/shared';

/** Token budget of the whole `## Project context` block (AC-34). */
export const CONTEXT_BUDGET_TOKENS = 8000;

export interface ReadContextDoc {
  path: string;
  source: 'repo' | 'local';
  content: string;
}

export type ReadResult =
  | { ok: true; doc: ReadContextDoc }
  | { ok: false; reason: string };

export interface InjectedContextDoc {
  path: string;
  source: 'repo' | 'local';
  content: string;
  /** Tokens of the wrapped untrusted block of this document (Q-5). */
  tokens: number;
}

export interface ResolvedContext {
  injected: InjectedContextDoc[];
  skipped: Array<{ path: string; reason: string }>;
  /** Sum of the injected documents' wrapped-block tokens. */
  blockTokens: number;
}

export const EMPTY_CONTEXT: ResolvedContext = { injected: [], skipped: [], blockTokens: 0 };

/** Agent's own documents first, then each skill's in link order; first occurrence wins (AC-27). */
export function collectPaths(agentDocs: readonly string[], skills: ReadonlyArray<{ contextDocs: readonly string[] }>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of [...agentDocs, ...skills.flatMap((s) => s.contextDocs)]) {
    if (seen.has(p)) continue;
    seen.add(p);
    out.push(p);
  }
  return out;
}

/**
 * Read every path in parallel, then decide in order: an unreadable document is
 * skipped with its reason; a document that would take the block over `budget`
 * is skipped whole (`over_budget`) and the next ones are still tried.
 */
export async function resolveContextDocs(input: {
  paths: string[];
  read: (path: string) => Promise<ReadResult>;
  /** Tokens of the wrapped untrusted block for this document. */
  count: (path: string, content: string) => number;
  budget?: number;
}): Promise<ResolvedContext> {
  const budget = input.budget ?? CONTEXT_BUDGET_TOKENS;
  const results = await Promise.all(
    input.paths.map((p) =>
      input.read(p).catch((): ReadResult => ({ ok: false, reason: 'not_found' })),
    ),
  );
  const injected: InjectedContextDoc[] = [];
  const skipped: Array<{ path: string; reason: string }> = [];
  let total = 0;
  results.forEach((r, i) => {
    const path = input.paths[i]!;
    if (!r.ok) {
      skipped.push({ path, reason: r.reason });
      return;
    }
    const tokens = input.count(path, r.doc.content);
    if (total + tokens > budget) {
      skipped.push({ path, reason: 'over_budget' });
      return;
    }
    total += tokens;
    injected.push({ path, source: r.doc.source, content: r.doc.content, tokens });
  });
  return { injected, skipped, blockTokens: total };
}

/**
 * Drop cited paths that were not injected in this run (AC-49), dedupe the rest.
 * Findings are kept. Returns the cleaned findings and the removed paths.
 */
export function filterCitations<F extends Finding>(
  findings: F[],
  injectedPaths: readonly string[],
): { findings: F[]; removed: string[] } {
  const allowed = new Set(injectedPaths);
  const removed: string[] = [];
  const out = findings.map((f) => {
    if (!f.cited_docs) return f;
    const kept: string[] = [];
    for (const p of f.cited_docs) {
      if (!allowed.has(p)) {
        if (!removed.includes(p)) removed.push(p);
        continue;
      }
      if (!kept.includes(p)) kept.push(p);
    }
    return { ...f, cited_docs: kept };
  });
  return { findings: out, removed };
}

/** `RunTrace.context` for a run; `null` when no document was read or skipped. */
export function toTraceContext(ctx: ResolvedContext): RunTrace['context'] {
  if (ctx.injected.length === 0 && ctx.skipped.length === 0) return null;
  return {
    docs: ctx.injected.map(({ path, source, tokens }) => ({ path, source, tokens })),
    tokens: ctx.blockTokens,
    skipped: ctx.skipped,
  };
}
