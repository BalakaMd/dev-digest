import { z } from 'zod';
import type { GitClient, GitHubClient, IntentSource, LLMProvider, PrIntentRecord, Provider } from '@devdigest/shared';
import { AppError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { IntentFacade, IntentLog, IntentRepositoryPort, PullContext, ResolvedSource } from './types.js';
import {
  buildClassifierMessage,
  clampIntent,
  computeConfidence,
  docLabel,
  extractHunkHeaders,
  isStale,
  normalizeRepoPath,
  parseIntentLinks,
  planSpecFromChangedFiles,
  renderFilesBlock,
  truncateUtf8,
  utf8Bytes,
} from './helpers.js';
import {
  INTENT_PROMPT,
  INTENT_SCHEMA_NAME,
  INTENT_TEMPERATURE,
  MAX_DESCRIPTION_CHARS,
  MAX_DOC_BYTES,
  MAX_DOCS,
  MAX_FILES,
  MAX_ISSUE_BYTES,
  MAX_ITEM_CHARS,
  MAX_ITEMS,
  MAX_TITLE_CHARS,
  TOTAL_FETCH_BUDGET_BYTES,
} from './constants.js';

/**
 * What the classifier model returns. Strict JSON-schema structured output: no
 * optionals, no numeric/array bounds (limits are enforced in code — see
 * `clampIntent`), same discipline as `ConventionExtraction`.
 */
export const IntentClassification = z.object({
  summary: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
});
export type IntentClassification = z.infer<typeof IntentClassification>;

const NOOP_LOG: IntentLog = { info: () => undefined, error: () => undefined };

export interface IntentServiceDeps {
  repo: IntentRepositoryPort;
  llm: (id: Provider) => Promise<LLMProvider>;
  github: () => Promise<GitHubClient>;
  git: GitClient;
  countTokens: (text: string) => number;
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
}

/**
 * Intent classifier: collect sources (title/description/files + linked
 * issues/plan/spec docs) → deterministic confidence → one cheap structured
 * LLM call → clamp → persist. See `server/specs/review-flow.md` and the
 * Development Plan's "Data sources" section for the full source table.
 */
export class IntentService implements IntentFacade {
  constructor(private deps: IntentServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrIntentRecord | null> {
    const currentHeadSha = await this.deps.repo.getPullHeadSha(workspaceId, prId);
    if (currentHeadSha === undefined) throw new NotFoundError('Pull request not found');
    const stored = await this.deps.repo.getIntent(workspaceId, prId);
    if (!stored) return null;
    return { ...stored, stale: isStale(stored.head_sha, currentHeadSha) };
  }

  async getForReview(
    workspaceId: string,
    prId: string,
    log?: IntentLog,
  ): Promise<PrIntentRecord | undefined> {
    const l = log ?? NOOP_LOG;
    try {
      const stored = await this.get(workspaceId, prId);
      if (stored) {
        l.info(`Intent: using stored intent (confidence ${stored.confidence}, stale ${stored.stale})`);
        return stored;
      }
      l.info('Intent: none stored — deriving (best-effort)');
      const derived = await this.derive(workspaceId, prId, l);
      l.info(`Intent: derived (confidence ${derived.confidence})`);
      return derived;
    } catch (err) {
      l.info(`Intent: skipped — ${(err as Error).message}`);
      return undefined;
    }
  }

  async derive(workspaceId: string, prId: string, log?: IntentLog): Promise<PrIntentRecord> {
    const l = log ?? NOOP_LOG;
    const t0 = Date.now();
    const context = await this.deps.repo.getPullContext(workspaceId, prId);
    if (!context) throw new NotFoundError('Pull request not found');

    const { sources, fetchedIssues, fetchedDocs, links, title, description, filesForPrompt } =
      await this.collectSources(context, l);

    const confidence = computeConfidence({
      descriptionChars: description.trim().length,
      sources,
    });
    l.info(
      `Intent: model choice, sources and confidence`,
      { confidence, sources: sources.length, ignoredLinks: links.ignoredCount },
    );
    for (const s of sources) l.info('Intent: source', { kind: s.kind, ref: s.ref, status: s.status, bytes: s.bytes });
    l.info(`Intent: ${links.ignoredCount} link(s) ignored (not a fetchable source)`);

    const userMessage = buildClassifierMessage({
      repo: context.repo,
      prNumber: context.number,
      title,
      description,
      files: filesForPrompt,
      issues: fetchedIssues,
      docs: fetchedDocs,
      unavailable: sources
        .filter((s) => s.status === 'unreachable' || s.status === 'unsupported')
        .map((s) => ({ ref: s.ref, status: s.status })),
    });

    const systemPrompt = await renderPrompt(INTENT_PROMPT, {
      max_items: String(MAX_ITEMS),
      max_item_chars: String(MAX_ITEM_CHARS),
    });

    const choice = await this.deps.resolveModel(workspaceId);
    l.info(`Intent: model ${choice.provider}/${choice.model}`);
    const promptTokensEst = this.deps.countTokens(`${systemPrompt}\n\n${userMessage}`);
    l.info(`Intent: prompt ~${promptTokensEst} tokens (est)`);

    const llm = await this.deps.llm(choice.provider);
    let result;
    try {
      result = await llm.completeStructured<IntentClassification>({
        model: choice.model,
        schema: IntentClassification,
        schemaName: INTENT_SCHEMA_NAME,
        temperature: INTENT_TEMPERATURE,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
      });
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = (err as Error).message;
      l.error(`Intent: classifier call failed — ${msg}`);
      throw new ExternalServiceError(`Intent classifier call failed: ${msg}`);
    }

    const clamped = clampIntent(result.data);
    const stored = await this.deps.repo.upsert(workspaceId, context.prId, {
      summary: clamped.summary,
      inScope: clamped.in_scope,
      outOfScope: clamped.out_of_scope,
      confidence,
      sources: sources as IntentSource[],
      headSha: context.headSha,
      provider: choice.provider,
      model: result.model || choice.model,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      promptTokensEst,
    });
    // Defense in depth: `context` above already proved `prId` belongs to
    // `workspaceId`, so this should never trigger outside a race.
    if (!stored) throw new NotFoundError('Pull request not found');

    l.info('Intent: derived', {
      confidence,
      inScope: clamped.in_scope.length,
      outOfScope: clamped.out_of_scope.length,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      costUsd: result.costUsd,
      durationMs: Date.now() - t0,
    });

    return { ...stored, stale: false };
  }

  // ---------------------------------------------------------------- internals

  /**
   * D1–D7: assemble every source and, for issues/plan/spec docs, fetch their
   * content (best-effort, budget-capped). GitHub failures (incl. no token
   * configured) never fail the derivation — they turn the source `unreachable`
   * (docs additionally fall back to the local clone when there is no token).
   */
  private async collectSources(
    context: PullContext,
    l: IntentLog,
  ): Promise<{
    sources: ResolvedSource[];
    fetchedIssues: { ref: string; content: string }[];
    fetchedDocs: { ref: string; label: 'plan' | 'spec'; content: string }[];
    links: ReturnType<typeof parseIntentLinks>;
    title: string;
    description: string;
    filesForPrompt: { path: string; headers: string[] }[];
  }> {
    const sources: ResolvedSource[] = [];
    const title = context.title.slice(0, MAX_TITLE_CHARS);
    const description = (context.body ?? '').slice(0, MAX_DESCRIPTION_CHARS);
    const filesForPrompt = context.files
      .slice(0, MAX_FILES)
      .map((f) => ({ path: f.path, headers: extractHunkHeaders(f.patch) }));

    sources.push({
      kind: 'title',
      ref: 'title',
      status: context.title.length > MAX_TITLE_CHARS ? 'truncated' : 'used',
      bytes: utf8Bytes(title),
      detail: null,
    });
    if (description.trim().length > 0) {
      sources.push({
        kind: 'description',
        ref: 'description',
        status: (context.body ?? '').length > MAX_DESCRIPTION_CHARS ? 'truncated' : 'used',
        bytes: utf8Bytes(description),
        detail: null,
      });
    }
    sources.push({
      kind: 'files',
      ref: 'files',
      status: 'used',
      bytes: utf8Bytes(renderFilesBlock(filesForPrompt)),
      detail: `${filesForPrompt.length} file(s), headers only (no diff body)`,
    });

    const links = parseIntentLinks(context.body, context.repo);

    let github: GitHubClient | undefined;
    let githubError: string | undefined;
    try {
      github = await this.deps.github();
    } catch (err) {
      githubError = (err as Error).message;
    }

    let remainingBudget = TOTAL_FETCH_BUDGET_BYTES;
    const fetchedIssues: { ref: string; content: string }[] = [];
    for (const issue of links.issues) {
      const ref =
        issue.owner.toLowerCase() === context.repo.owner.toLowerCase() &&
        issue.name.toLowerCase() === context.repo.name.toLowerCase()
          ? `#${issue.number}`
          : `${issue.owner}/${issue.name}#${issue.number}`;
      if (!github) {
        sources.push({
          kind: 'issue',
          ref,
          status: 'unreachable',
          bytes: null,
          detail: githubError ?? 'GitHub not configured',
        });
        continue;
      }
      if (remainingBudget <= 0) {
        sources.push({ kind: 'issue', ref, status: 'skipped', bytes: null, detail: 'over fetch budget' });
        continue;
      }
      try {
        const meta = await github.getIssue({ owner: issue.owner, name: issue.name }, issue.number);
        const content = `Title: ${meta.title}\n\n${meta.body ?? ''}`;
        const { text, truncated, bytes } = truncateUtf8(content, Math.min(MAX_ISSUE_BYTES, remainingBudget));
        remainingBudget = Math.max(0, remainingBudget - bytes);
        fetchedIssues.push({ ref, content: text });
        sources.push({ kind: 'issue', ref, status: truncated ? 'truncated' : 'used', bytes, detail: null });
      } catch (err) {
        sources.push({ kind: 'issue', ref, status: 'unreachable', bytes: null, detail: (err as Error).message });
      }
    }

    // D5 (linked docs) + D6 (plan/spec files changed by the PR itself), merged
    // and deduped — D6 counts toward the same MAX_DOCS cap.
    const changedDocPaths = planSpecFromChangedFiles(context.files.map((f) => f.path))
      .map((p) => normalizeRepoPath(p))
      .filter((p): p is string => p !== null);
    const docPaths: string[] = [];
    const seenDocPaths = new Set<string>();
    for (const p of [...links.docs.map((d) => d.path), ...changedDocPaths]) {
      if (seenDocPaths.has(p)) continue;
      seenDocPaths.add(p);
      docPaths.push(p);
      if (docPaths.length >= MAX_DOCS) break;
    }

    const fetchedDocs: { ref: string; label: 'plan' | 'spec'; content: string }[] = [];
    for (const path of docPaths) {
      const label = docLabel(path);
      if (remainingBudget <= 0) {
        sources.push({ kind: label, ref: path, status: 'skipped', bytes: null, detail: 'over fetch budget' });
        continue;
      }
      let content: string | undefined;
      let viaClone = false;
      if (github) {
        try {
          content = await github.getFileContent(context.repo, path, context.headSha);
        } catch (err) {
          sources.push({ kind: label, ref: path, status: 'unreachable', bytes: null, detail: (err as Error).message });
          continue;
        }
      } else {
        viaClone = true;
        try {
          const raw = await this.deps.git.readFile(context.repo, path);
          content = raw.trim().length > 0 ? raw : undefined;
        } catch {
          content = undefined;
        }
        if (content === undefined) {
          sources.push({
            kind: label,
            ref: path,
            status: 'unreachable',
            bytes: null,
            detail: githubError ? `${githubError}; not found in local clone` : 'not found in local clone',
          });
          continue;
        }
      }
      const { text, truncated, bytes } = truncateUtf8(content, Math.min(MAX_DOC_BYTES, remainingBudget));
      remainingBudget = Math.max(0, remainingBudget - bytes);
      fetchedDocs.push({ ref: path, label, content: text });
      sources.push({
        kind: label,
        ref: path,
        status: truncated ? 'truncated' : 'used',
        bytes,
        detail: viaClone ? 'read from local clone (default branch, not the PR head)' : null,
      });
    }

    for (const u of links.unsupported) {
      sources.push({ kind: 'link', ref: u.ref, status: 'unsupported', bytes: null, detail: null });
    }

    return { sources, fetchedIssues, fetchedDocs, links, title, description, filesForPrompt };
  }
}
