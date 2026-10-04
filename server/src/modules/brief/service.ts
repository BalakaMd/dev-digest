import type { PrBlastRadiusResponse, PrBrief, PrBriefResponse, Provider } from '@devdigest/shared';
import { AppError, ConflictError, ExternalServiceError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import {
  BRIEF_INPUT_BUDGET_TOKENS,
  BRIEF_MAX_TOKENS,
  BRIEF_PROMPT,
  BRIEF_SCHEMA_NAME,
  BRIEF_TEMPERATURE,
  BRIEF_TIMEOUT_MS,
  DEFAULT_TOUR_LANGUAGE,
  MAX_ISSUE_BYTES,
} from './constants.js';
import { BriefAnswer, extractHunks, groundAnswer, isStale, normalizePath, sanitizeError, truncateUtf8 } from './helpers.js';
import { fitToBudget } from './prompt.js';
import type {
  BriefFacade,
  BriefLogger,
  BriefServiceDeps,
  PromptCaller,
  PromptInput,
  PullFacts,
} from './types.js';

const NOOP_LOG: BriefLogger = { info: () => undefined, error: () => undefined };

type MissingInput = PrBrief['missing_inputs'][number];

/**
 * PR Brief use cases. Reading never calls the model (AC-29). A generation
 * makes exactly ONE `completeStructured` call (`singleAttempt`, no retry,
 * NFR-1); every rejection (404, missing key, 409, over budget) happens before
 * the provider is even resolved. Runs in the request, like Intent; the
 * in-memory registry (single API instance) rejects a second concurrent one.
 */
export class BriefService implements BriefFacade {
  private running = new Set<string>();

  constructor(private deps: BriefServiceDeps) {}

  async get(workspaceId: string, prId: string): Promise<PrBriefResponse> {
    const head = await this.deps.repo.getHeadSha(workspaceId, prId);
    if (head === undefined) throw new NotFoundError('Pull request not found');
    const brief = await this.deps.repo.getStored(workspaceId, prId);
    return brief ? { brief, stale: isStale(brief.head_sha, head) } : { brief: null, stale: false };
  }

  async generate(workspaceId: string, prId: string, log: BriefLogger = NOOP_LOG): Promise<PrBriefResponse> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const choice = await this.deps.resolveModel(workspaceId);
    if (!(await this.deps.hasSecret(choice.provider))) {
      throw new ValidationError(`No API key is stored for ${choice.provider}`, {
        reason: 'missing_key',
        provider: choice.provider,
      });
    }

    // Check-and-set with no await in between (AC-42).
    const key = `${workspaceId}:${prId}`;
    if (this.running.has(key)) {
      throw new ConflictError('Generation already running', { reason: 'already_running' });
    }
    this.running.add(key);
    const startedAt = this.deps.now();
    const base = { prId, provider: choice.provider, model: choice.model };
    try {
      const brief = await this.run(workspaceId, pull, choice, startedAt, log);
      return { brief, stale: false };
    } catch (err) {
      const error = err instanceof AppError ? err.message : sanitizeError(err);
      log.error(
        { ...base, error, durationMs: this.deps.now().getTime() - startedAt.getTime() },
        'brief: generation failed',
      );
      if (err instanceof AppError) throw err;
      throw new ExternalServiceError(error, { reason: 'generation_failed' });
    } finally {
      this.running.delete(key);
    }
  }

  // ---------------------------------------------------------------- internals

  private async run(
    workspaceId: string,
    pull: PullFacts,
    choice: { provider: Provider; model: string },
    startedAt: Date,
    log: BriefLogger,
  ): Promise<PrBrief> {
    const { deps } = this;
    const prId = pull.prId;
    const language = (await deps.repo.getTourLanguage(workspaceId)) ?? DEFAULT_TOUR_LANGUAGE;
    const missing: MissingInput[] = [];

    // Intent: stored only, never derived (AC-10).
    let intent: PromptInput['intent'] = null;
    try {
      const stored = await deps.intent.get(workspaceId, prId);
      if (stored) intent = { summary: stored.summary, in_scope: stored.in_scope, out_of_scope: stored.out_of_scope };
    } catch {
      /* treated as missing below */
    }
    if (!intent) missing.push({ input: 'intent', reason: 'not_derived' });

    // Blast radius: a degraded or failing map is ignored for the prompt AND for grounding.
    let blast: PrBlastRadiusResponse | null = null;
    try {
      const b = await deps.blast.getForPull(workspaceId, prId);
      if (b.degraded) missing.push({ input: 'blast', reason: b.degraded_reason ?? 'degraded' });
      else blast = b;
    } catch {
      missing.push({ input: 'blast', reason: 'unavailable' });
    }

    const allowed = new Set<string>();
    for (const f of pull.files) allowed.add(f.path);
    const callers: PromptCaller[] = [];
    if (blast) {
      for (const s of blast.changed_symbols) addAllowed(allowed, s.file);
      const seen = new Set<string>();
      for (const d of blast.downstream) {
        for (const c of d.callers) {
          addAllowed(allowed, c.file);
          const id = `${c.name}\u0000${c.file}\u0000${c.line}`;
          if (seen.has(id)) continue;
          seen.add(id);
          callers.push({ symbol: c.name, file: c.file, line: c.line });
        }
      }
    }

    const findings = await deps.findings(workspaceId, prId).catch(() => []);

    // Specification documents (AC-23): de-duplicated, sorted, read as the effective document.
    const paths = [...new Set(await deps.specPaths(workspaceId).catch(() => [] as string[]))].sort();
    const specs: { path: string; content: string }[] = [];
    for (const path of paths) {
      try {
        const content = await deps.readSpecDoc(pull.repo, path);
        if (content.trim()) specs.push({ path, content });
      } catch {
        /* one unreadable document is not a missing input (plan Q-suggestion b) */
      }
    }
    if (specs.length === 0) {
      missing.push({ input: 'specs', reason: paths.length === 0 ? 'none_attached' : 'unreadable' });
    }

    // First linked issue: the only external read (NFR-2).
    let issue: PromptInput['issue'] = null;
    const ref = deps.firstIssueRef(pull.body, pull.repo);
    if (ref) {
      try {
        const github = await deps.github();
        const meta = await github.getIssue({ owner: ref.owner, name: ref.name }, ref.number);
        const titleBytes = new TextEncoder().encode(meta.title).byteLength;
        const body = truncateUtf8(meta.body ?? '', Math.max(0, MAX_ISSUE_BYTES - titleBytes)).text;
        issue = { title: meta.title, body };
      } catch (err) {
        missing.push({ input: 'issue', reason: sanitizeError(err) });
      }
    }

    const input: PromptInput = {
      language,
      title: pull.title,
      description: pull.body,
      intent,
      blast: blast ? { summary: blast.summary, callers } : null,
      totals: {
        files: pull.files.length,
        additions: pull.files.reduce((n, f) => n + f.additions, 0),
        deletions: pull.files.reduce((n, f) => n + f.deletions, 0),
      },
      files: pull.files.map((f) => ({
        path: f.path,
        additions: f.additions,
        deletions: f.deletions,
        role: deps.classify(f.path),
        hunks: extractHunks(f.patch),
      })),
      findings: findings.map((f) => ({ file: f.file, line: f.line, title: f.title, severity: f.severity })),
      issue,
      specs,
    };

    const system = await renderPrompt(BRIEF_PROMPT, { language });
    const fit = fitToBudget({ system, input, count: deps.countTokens, budget: BRIEF_INPUT_BUDGET_TOKENS });
    if (!fit.ok) {
      throw new ValidationError(
        `The fixed inputs alone use ${fit.fixedTokens} tokens, over the ${BRIEF_INPUT_BUDGET_TOKENS}-token budget`,
        { reason: 'over_budget', fixed_tokens: fit.fixedTokens, budget: BRIEF_INPUT_BUDGET_TOKENS },
      );
    }

    const llm = await deps.llm(choice.provider);
    // Exactly one provider request: no retry wrapper, no reprompt (AC-26, NFR-1).
    const result = await llm.completeStructured<BriefAnswer>({
      model: choice.model,
      schema: BriefAnswer,
      schemaName: BRIEF_SCHEMA_NAME,
      temperature: BRIEF_TEMPERATURE,
      maxTokens: BRIEF_MAX_TOKENS,
      timeoutMs: BRIEF_TIMEOUT_MS,
      maxRetries: 0,
      singleAttempt: true,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: fit.user },
      ],
    });

    const grounded = groundAnswer(result.data, allowed);
    const generatedAt = deps.now();
    const brief: PrBrief = {
      summary: result.data.summary,
      risks: grounded.risks,
      review_focus: grounded.review_focus,
      head_sha: pull.headSha,
      generated_at: generatedAt.toISOString(),
      language,
      provider: choice.provider,
      model: result.model || choice.model,
      tokens_in: result.tokensIn,
      tokens_out: result.tokensOut,
      cost_usd: result.costUsd,
      input_tokens: fit.total,
      missing_inputs: missing,
      shortened_inputs: fit.shortened,
    };
    const saved = await deps.repo.save(workspaceId, prId, brief);
    if (!saved) throw new NotFoundError('Pull request not found');

    log.info(
      {
        prId,
        inputTokens: fit.total,
        tokensBySource: fit.tokensBySource,
        shortened: fit.shortened,
        missing: missing.map((m) => m.input),
        ...grounded.counts,
        language,
        provider: choice.provider,
        model: brief.model,
        tokensIn: result.tokensIn,
        tokensOut: result.tokensOut,
        costUsd: result.costUsd,
        durationMs: generatedAt.getTime() - startedAt.getTime(),
      },
      'brief: generation finished',
    );
    return brief;
  }
}

function addAllowed(allowed: Set<string>, raw: string): void {
  const p = normalizePath(raw);
  if (p !== null) allowed.add(p);
}
