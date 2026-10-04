import type { GitClient, LLMProvider, OnboardingTourState, Provider, TourLanguage } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { renderPrompt } from '../../platform/prompts.js';
import type { OnboardingFacts, RepoIntel } from '../repo-intel/types.js';
import {
  CRITICAL_PATHS_SIZE,
  DEFAULT_TOUR_LANGUAGE,
  ONBOARDING_MAX_TOKENS,
  ONBOARDING_PROMPT,
  ONBOARDING_SCHEMA_NAME,
  ONBOARDING_TEMPERATURE,
  ONBOARDING_TIMEOUT_MS,
  READING_PATH_SIZE,
} from './constants.js';
import {
  OnboardingNarrative,
  assembleTour,
  buildUserMessage,
  evaluateReadiness,
  sanitizeError,
  staleFlags,
} from './helpers.js';
import { collectRunSources } from './run-sources.js';
import type {
  IndexSnapshot,
  OnboardingLogger,
  OnboardingRepoBasics,
  OnboardingRepositoryPort,
} from './types.js';

export interface OnboardingServiceDeps {
  repo: OnboardingRepositoryPort;
  repoIntel: Pick<RepoIntel, 'getIndexState' | 'getOnboardingFacts'>;
  git: GitClient;
  llm: (id: Provider) => Promise<LLMProvider>;
  resolveModel: (workspaceId: string) => Promise<{ provider: Provider; model: string }>;
  /** Whether an API key is stored for the provider. */
  hasSecret: (provider: Provider) => Promise<boolean>;
  now: () => Date;
}

const NOOP_LOG: OnboardingLogger = { info: () => undefined, error: () => undefined };

interface Running {
  startedAt: Date;
  promise: Promise<void>;
}

/**
 * Onboarding tour use cases. Reading state never calls the LLM nor computes
 * facts (NFR-4). A generation makes exactly ONE `completeStructured` call
 * (`singleAttempt`), runs in-process (registry below — lost on API restart,
 * single API instance assumed, Q-5) and never throws into the caller.
 */
export class OnboardingService {
  private running = new Map<string, Running>();
  private failures = new Map<string, { error: string; startedAt: Date }>();

  constructor(private deps: OnboardingServiceDeps) {}

  private key(workspaceId: string, repoId: string): string {
    return `${workspaceId}:${repoId}`;
  }

  private async indexSnapshot(repoId: string): Promise<IndexSnapshot> {
    const s = await this.deps.repoIntel.getIndexState(repoId);
    // The facade synthesises a degraded `no_data` reply when there is no index row at all.
    const none = s.degradedReason === 'no_data' && s.lastIndexedSha === '';
    return { status: none ? 'none' : s.status, filesIndexed: s.filesIndexed, updatedAt: s.updatedAt };
  }

  async getState(workspaceId: string, repoId: string): Promise<OnboardingTourState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    return this.buildState(workspaceId, repo);
  }

  /**
   * Start (or attach to) a generation. Order: 404 → readiness 422 → missing key
   * 422 → attach to a running one → start. Rejections happen before any LLM call.
   */
  async generate(
    workspaceId: string,
    repoId: string,
    log: OnboardingLogger = NOOP_LOG,
  ): Promise<OnboardingTourState> {
    const repo = await this.requireRepo(workspaceId, repoId);
    const index = await this.indexSnapshot(repoId);
    const blocked = evaluateReadiness({ index, clonePath: repo.clonePath });
    if (blocked) throw new ValidationError(blocked.message, blocked);

    const choice = await this.deps.resolveModel(workspaceId);
    if (!(await this.deps.hasSecret(choice.provider))) {
      throw new ValidationError(`No API key is stored for ${choice.provider}`, {
        reason: 'missing_key',
        provider: choice.provider,
      });
    }

    const language = (await this.deps.repo.getTourLanguage(workspaceId)) ?? DEFAULT_TOUR_LANGUAGE;

    // Attach-or-start must have no await between the check and the set (AC-23).
    const k = this.key(workspaceId, repoId);
    if (!this.running.has(k)) {
      this.failures.delete(k);
      const startedAt = this.deps.now();
      const promise = this.run({ workspaceId, repo, index, choice, language, startedAt, log }).finally(
        () => this.running.delete(k),
      );
      this.running.set(k, { startedAt, promise });
    }
    return this.buildState(workspaceId, repo);
  }

  /** Test/ops hook: resolves when the generation of this repo (if any) settled. */
  async whenIdle(workspaceId: string, repoId: string): Promise<void> {
    await this.running.get(this.key(workspaceId, repoId))?.promise;
  }

  // ---------------------------------------------------------------- internals

  private async requireRepo(workspaceId: string, repoId: string): Promise<OnboardingRepoBasics> {
    const repo = await this.deps.repo.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repository not found');
    return repo;
  }

  private async buildState(
    workspaceId: string,
    repo: OnboardingRepoBasics,
  ): Promise<OnboardingTourState> {
    const [stored, index, savedLanguage, choice] = await Promise.all([
      this.deps.repo.getStoredTour(workspaceId, repo.id),
      this.indexSnapshot(repo.id),
      this.deps.repo.getTourLanguage(workspaceId),
      this.deps.resolveModel(workspaceId),
    ]);
    const tourLanguage: TourLanguage = savedLanguage ?? DEFAULT_TOUR_LANGUAGE;
    const k = this.key(workspaceId, repo.id);
    const run = this.running.get(k);
    const failure = this.failures.get(k);

    const flags = stored
      ? staleFlags({
          storedLanguage: stored.tour.language,
          currentLanguage: tourLanguage,
          indexStatus: index.status,
          indexUpdatedAt: index.updatedAt,
          generatedAt: stored.generatedAt,
        })
      : { language_changed: false, index_changed: false };

    const hasKey = await this.deps.hasSecret(choice.provider);
    return {
      tour: stored?.tour ?? null,
      generation: run
        ? { status: 'running', started_at: run.startedAt.toISOString(), error: null }
        : failure
          ? { status: 'failed', started_at: failure.startedAt.toISOString(), error: failure.error }
          : { status: 'idle', started_at: null, error: null },
      blocked: evaluateReadiness({ index, clonePath: repo.clonePath }),
      missing_key: hasKey ? null : { provider: choice.provider },
      tour_language: tourLanguage,
      ...flags,
      repo: { full_name: repo.fullName, default_branch: repo.defaultBranch },
    };
  }

  /** The background generation. Never rejects; failures land in `failures`. */
  private async run(ctx: {
    workspaceId: string;
    repo: OnboardingRepoBasics;
    index: IndexSnapshot;
    choice: { provider: Provider; model: string };
    language: TourLanguage;
    startedAt: Date;
    log: OnboardingLogger;
  }): Promise<void> {
    const { workspaceId, repo, choice, language, log } = ctx;
    const k = this.key(workspaceId, repo.id);
    const base = { repoId: repo.id, provider: choice.provider, model: choice.model, language };
    log.info(base, 'onboarding: generation started');
    try {
      const facts: OnboardingFacts = await this.deps.repoIntel.getOnboardingFacts(repo.id, {
        readingPath: READING_PATH_SIZE,
        criticalPaths: CRITICAL_PATHS_SIZE,
      });
      if (facts.indexedPaths.length === 0) throw new Error('The index contains no source files');
      const ref = { owner: repo.owner, name: repo.name };
      const runSources = await collectRunSources(this.deps.git, ref, facts.indexedPaths);

      const system = await renderPrompt(ONBOARDING_PROMPT, { language });
      const user = buildUserMessage({
        language,
        repoFullName: repo.fullName,
        indexedFiles: ctx.index.filesIndexed,
        facts,
        runSources,
      });

      const llm = await this.deps.llm(choice.provider);
      // Exactly one provider request: no retry wrapper, no reprompt loop (AC-15/AC-20, NFR-1).
      const result = await llm.completeStructured<OnboardingNarrative>({
        model: choice.model,
        schema: OnboardingNarrative,
        schemaName: ONBOARDING_SCHEMA_NAME,
        temperature: ONBOARDING_TEMPERATURE,
        maxTokens: ONBOARDING_MAX_TOKENS,
        timeoutMs: ONBOARDING_TIMEOUT_MS,
        maxRetries: 0,
        singleAttempt: true,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      });

      const generatedAt = this.deps.now();
      const { tour, droppedPaths } = assembleTour({
        narrative: result.data,
        facts,
        language,
        indexedFiles: ctx.index.filesIndexed,
        provider: choice.provider,
        model: result.model || choice.model,
        generatedAt: generatedAt.toISOString(),
      });
      await this.deps.repo.saveTour(workspaceId, repo.id, tour, generatedAt);
      log.info(
        {
          ...base,
          tokensIn: result.tokensIn,
          tokensOut: result.tokensOut,
          costUsd: result.costUsd,
          droppedPaths,
          durationMs: this.deps.now().getTime() - ctx.startedAt.getTime(),
        },
        'onboarding: generation finished',
      );
    } catch (err) {
      const error = sanitizeError(err);
      this.failures.set(k, { error, startedAt: ctx.startedAt });
      log.error(
        { ...base, error, durationMs: this.deps.now().getTime() - ctx.startedAt.getTime() },
        'onboarding: generation failed',
      );
    }
  }
}
