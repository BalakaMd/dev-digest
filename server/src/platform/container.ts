import type {
  AuthProvider,
  SecretsProvider,
  GitHubClient,
  GitClient,
  CodeIndex,
  Embedder,
  LLMProvider,
} from '@devdigest/shared';
import type { AppConfig } from './config.js';
import type { Db } from '../db/client.js';
import { JobRunner } from './jobs.js';
import { runBus, type RunBus } from './sse.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import { LocalNoAuthProvider } from '../adapters/auth/local.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { SimpleGitClient } from '../adapters/git/simple-git.js';
import { RipgrepCodeIndex } from '../adapters/codeindex/ripgrep.js';
import { OpenAIProvider } from '../adapters/llm/openai.js';
import { AnthropicProvider } from '../adapters/llm/anthropic.js';
import { OpenAIEmbedder } from '../adapters/embedder/openai.js';
import { OpenRouterProvider } from '@devdigest/reviewer-core';
import { estimateCost } from '../adapters/llm/pricing.js';
import { PriceBook } from './price-book.js';
import { ConfigError } from './errors.js';
import { AgentsRepository } from '../modules/agents/repository.js';
import { ReviewRepository } from '../modules/reviews/repository.js';
import { PullsRepository } from '../modules/pulls/repository.js';
import { PullsService } from '../modules/pulls/service.js';
import type { RepoIntel } from '../modules/repo-intel/types.js';
import { RepoIntelService } from '../modules/repo-intel/service.js';
import { type DepGraph, DepCruiseGraph } from '../adapters/depgraph/index.js';
import { type Tokenizer, TiktokenTokenizer } from '../adapters/tokenizer/index.js';
import { type ContextDocStore, FsContextDocStore } from '../adapters/context-docs/index.js';
import type { IntentFacade } from '../modules/intent/types.js';
import { IntentRepository } from '../modules/intent/repository.js';
import { IntentService } from '../modules/intent/service.js';
import type { BlastFacade } from '../modules/blast/types.js';
import { BlastRepository } from '../modules/blast/repository.js';
import { BlastService } from '../modules/blast/service.js';
import type { HistoryFacade } from '../modules/history/types.js';
import { HistoryRepository } from '../modules/history/repository.js';
import { HistoryService } from '../modules/history/service.js';
import { ContextDocsRepository } from '../modules/context-docs/repository.js';
import { ContextDocsService } from '../modules/context-docs/service.js';
import { resolveFeatureModel } from '../modules/settings/feature-models.js';
import { SECRET_KEY_BY_PROVIDER } from '../modules/settings/constants.js';
import { OnboardingRepository } from '../modules/onboarding/repository.js';
import { OnboardingService } from '../modules/onboarding/service.js';
import { BriefRepository } from '../modules/brief/repository.js';
import { BriefService } from '../modules/brief/service.js';
import { selectLatestReviews } from '../modules/reviews/smart-diff/build.js';
import { classifyFile } from '../modules/reviews/smart-diff/classify.js';
import { collectPaths } from '../modules/reviews/context-docs.js';
import { parseIntentLinks } from '../modules/intent/helpers.js';

/**
 * DI container. One per app instance. Holds config, db, the JobRunner,
 * the SSE bus, and lazily-constructed adapters resolved through SecretsProvider.
 *
 * Tests construct a container with `overrides` to inject mock adapters; the
 * Services depend on these interfaces, not the concrete classes.
 */
export interface ContainerOverrides {
  secrets?: SecretsProvider;
  auth?: AuthProvider;
  github?: GitHubClient;
  git?: GitClient;
  codeIndex?: CodeIndex;
  embedder?: Embedder;
  /** Pre-built providers by id (skip key lookup). */
  llm?: Partial<Record<'openai' | 'anthropic' | 'openrouter', LLMProvider>>;
  /** repo-intel facade (T1.1+) — tests inject mock RepoIntel implementations. */
  repoIntel?: RepoIntel;
  /** repo-intel T3 adapters — only the indexer pipeline reads these. */
  depgraph?: DepGraph;
  tokenizer?: Tokenizer;
  /** Context-document reader — tests inject `MockContextDocStore`. */
  contextDocs?: ContextDocStore;
  /** Intent facade (S4) — tests inject a fake to skip DB/LLM/GitHub entirely. */
  intent?: IntentFacade;
  /** Blast-radius facade — tests inject a fake to skip DB/repo-intel entirely. */
  blast?: BlastFacade;
  /** PR history facade — tests inject a fake or a MockGitHubClient-backed service. */
  history?: HistoryFacade;
}

export class Container {
  readonly config: AppConfig;
  readonly db: Db;
  readonly secrets: SecretsProvider;
  readonly auth: AuthProvider;
  readonly jobs: JobRunner;
  readonly runBus: RunBus;

  private _git?: GitClient;
  private _github?: GitHubClient;
  private _codeIndex?: CodeIndex;
  private _embedder?: Embedder;
  private llmCache = new Map<string, LLMProvider>();

  // Shared repositories for cross-cutting entities (agents, reviews/pulls,
  // runs). Constructed here, in the composition root, so consuming modules use
  // `container.agentsRepo` instead of reaching into another module's folder.
  private _agentsRepo?: AgentsRepository;
  private _reviewRepo?: ReviewRepository;
  private _pulls?: PullsService;
  private _repoIntel?: RepoIntel;
  private _depgraph?: DepGraph;
  private _tokenizer?: Tokenizer;
  private _contextDocs?: ContextDocStore;
  private _contextDocsService?: ContextDocsService;
  private _priceBook?: PriceBook;
  private _intent?: IntentFacade;
  private _blast?: BlastFacade;
  private _history?: HistoryFacade;
  private _onboarding?: OnboardingService;
  private _brief?: BriefService;

  constructor(config: AppConfig, db: Db, private overrides: ContainerOverrides = {}) {
    this.config = config;
    this.db = db;
    this.secrets = overrides.secrets ?? new LocalSecretsProvider(config.secretsPath);
    this.auth = overrides.auth ?? new LocalNoAuthProvider(db);
    this.runBus = runBus;
    this.jobs = new JobRunner(db);
  }

  get git(): GitClient {
    if (this.overrides.git) return this.overrides.git;
    this._git ??= new SimpleGitClient(this.config.cloneDir);
    return this._git;
  }

  get agentsRepo(): AgentsRepository {
    return (this._agentsRepo ??= new AgentsRepository(this.db));
  }

  get reviewRepo(): ReviewRepository {
    return (this._reviewRepo ??= new ReviewRepository(this.db));
  }

  /** X1 — the PR-by-repo-and-number lookup (`GET /repos/:id/pulls/:number`). */
  get pulls(): PullsService {
    return (this._pulls ??= new PullsService({
      repo: new PullsRepository(this.db),
      now: () => Date.now(),
    }));
  }

  get codeIndex(): CodeIndex {
    if (this.overrides.codeIndex) return this.overrides.codeIndex;
    this._codeIndex ??= new RipgrepCodeIndex(this.git);
    return this._codeIndex;
  }

  /**
   * The repo-intel facade (T1.1). All higher-level features (reviews,
   * blast/onboarding migrations, phantom-gate) code against this interface.
   * Tests inject a mock via `ContainerOverrides.repoIntel`.
   */
  get repoIntel(): RepoIntel {
    if (this.overrides.repoIntel) return this.overrides.repoIntel;
    this._repoIntel ??= new RepoIntelService(this);
    return this._repoIntel;
  }

  /** Import-graph builder (dependency-cruiser). T3 indexer pipeline only. */
  get depgraph(): DepGraph {
    if (this.overrides.depgraph) return this.overrides.depgraph;
    this._depgraph ??= new DepCruiseGraph();
    return this._depgraph;
  }

  /** Token counter (js-tiktoken) for the repo-map budget search. */
  get tokenizer(): Tokenizer {
    if (this.overrides.tokenizer) return this.overrides.tokenizer;
    this._tokenizer ??= new TiktokenTokenizer();
    return this._tokenizer;
  }

  /** Project context-document reader (repo working copy + local overlay). */
  get contextDocs(): ContextDocStore {
    if (this.overrides.contextDocs) return this.overrides.contextDocs;
    this._contextDocs ??= new FsContextDocStore({
      globs: this.config.contextDocGlobs,
      contextDir: this.config.contextDir,
      clonePathFor: (repo) => this.git.clonePathFor(repo),
      countTokens: (text) => this.tokenizer.count(text),
    });
    return this._contextDocs;
  }

  /**
   * Intent facade (S4) — the ONLY way another module reaches the intent
   * classifier (`run-executor.ts` calls `container.intent.getForReview(...)`,
   * never imports `modules/intent` directly).
   */
  get intent(): IntentFacade {
    if (this.overrides.intent) return this.overrides.intent;
    this._intent ??= new IntentService({
      repo: new IntentRepository(this.db),
      llm: (id) => this.llm(id),
      github: () => this.github(),
      git: this.git,
      countTokens: (text) => this.tokenizer.count(text),
      resolveModel: (workspaceId) => resolveFeatureModel(this, workspaceId, 'review_intent'),
    });
    return this._intent;
  }

  /** Onboarding tour use cases (SPEC-03) — a singleton: it owns the in-memory generation registry. */
  get onboarding(): OnboardingService {
    this._onboarding ??= new OnboardingService({
      repo: new OnboardingRepository(this.db),
      repoIntel: this.repoIntel,
      git: this.git,
      llm: (id) => this.llm(id),
      resolveModel: (workspaceId) => resolveFeatureModel(this, workspaceId, 'onboarding'),
      hasSecret: async (provider) => Boolean(await this.secrets.get(SECRET_KEY_BY_PROVIDER[provider])),
      now: () => new Date(),
    });
    return this._onboarding;
  }

  /** PR Brief use cases (SPEC-04) — a singleton: it owns the in-memory per-PR generation registry. */
  get brief(): BriefService {
    this._brief ??= new BriefService({
      repo: new BriefRepository(this.db),
      intent: this.intent,
      blast: this.blast,
      findings: async (_workspaceId, prId) => {
        const rows = await this.reviewRepo.reviewsForPull(prId);
        const latest = selectLatestReviews(
          rows.map((r) => ({ kind: r.review.kind, agent_id: r.review.agentId, findings: r.findings })),
        );
        return latest.flatMap((r) =>
          r.findings.map((f) => ({ file: f.file, line: f.startLine, title: f.title, severity: f.severity })),
        );
      },
      specPaths: async (workspaceId) => {
        const agents = await this.agentsRepo.listEnabled(workspaceId);
        const paths = new Set<string>();
        for (const agent of agents) {
          const links = await this.agentsRepo.enabledSkillsForPrompt(agent.id);
          const skills = links.map((l) => ({ contextDocs: l.skill.contextDocs ?? [] }));
          for (const p of collectPaths(agent.contextDocs ?? [], skills)) paths.add(p);
        }
        return [...paths];
      },
      readSpecDoc: async (repo, path) =>
        (await this.contextDocs.readEffective({ repoId: repo.id, repo: { owner: repo.owner, name: repo.name } }, path))
          .content,
      firstIssueRef: (body, repo) => parseIntentLinks(body, repo).issues[0] ?? null,
      github: () => this.github(),
      llm: (id) => this.llm(id),
      resolveModel: (workspaceId) => resolveFeatureModel(this, workspaceId, 'risk_brief'),
      hasSecret: async (provider) => Boolean(await this.secrets.get(SECRET_KEY_BY_PROVIDER[provider])),
      classify: classifyFile,
      countTokens: (text) => this.tokenizer.count(text),
      now: () => new Date(),
    });
    return this._brief;
  }

  /** Project context documents use cases (SPEC-01) — assembled here so routes never touch `db`. */
  get contextDocsService(): ContextDocsService {
    this._contextDocsService ??= new ContextDocsService({
      store: this.contextDocs,
      git: this.git,
      agents: this.agentsRepo,
      repos: new ContextDocsRepository(this.db),
    });
    return this._contextDocsService;
  }

  /** Blast-radius facade — reads the persisted repo-intel index; no LLM, no GitHub. */
  get blast(): BlastFacade {
    if (this.overrides.blast) return this.overrides.blast;
    this._blast ??= new BlastService({
      repo: new BlastRepository(this.db),
      repoIntel: this.repoIntel,
      repoIntelEnabled: this.config.repoIntelEnabled,
    });
    return this._blast;
  }

  /** Prior-PR history facade — GitHub GraphQL read with an in-memory cache; no LLM. */
  get history(): HistoryFacade {
    if (this.overrides.history) return this.overrides.history;
    this._history ??= new HistoryService({
      repo: new HistoryRepository(this.db),
      github: () => this.github(),
      now: () => Date.now(),
    });
    return this._history;
  }

  /**
   * Live OpenRouter pricing for cost attribution. The lister builds a bare
   * OpenRouter provider just for `/models` (no estimator needed) and degrades to
   * `[]` when no key is configured; the static `estimateCost` table is the
   * fallback for OpenAI/Anthropic and a cold/cold-failed cache.
   */
  get priceBook(): PriceBook {
    this._priceBook ??= new PriceBook(async () => {
      try {
        const key = await this.secrets.get('OPENROUTER_API_KEY');
        if (!key) return [];
        return await new OpenRouterProvider(key).listModels();
      } catch {
        return [];
      }
    }, estimateCost);
    return this._priceBook;
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (this._github) return this._github;
    const token = await this.secrets.get('GITHUB_TOKEN');
    if (!token) throw new ConfigError('GITHUB_TOKEN is not configured');
    this._github = new OctokitGitHubClient(token);
    return this._github;
  }

  /** Resolve an LLM provider by id; constructs from the secret key, cached. */
  async llm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    const injected = this.overrides.llm?.[id];
    if (injected) return injected;
    const cached = this.llmCache.get(id);
    if (cached) return cached;
    const provider = await this.buildLlm(id);
    this.llmCache.set(id, provider);
    return provider;
  }

  private async buildLlm(id: 'openai' | 'anthropic' | 'openrouter'): Promise<LLMProvider> {
    if (id === 'openai') {
      const key = await this.secrets.get('OPENAI_API_KEY');
      if (!key) throw new ConfigError('OPENAI_API_KEY is not configured');
      return new OpenAIProvider(key);
    }
    if (id === 'openrouter') {
      // Single OpenRouter provider lives in reviewer-core (shared with the CI
      // runner); inject the PriceBook so cost attribution uses LIVE OpenRouter
      // prices (with the static table as a fallback) rather than a hardcoded one.
      const key = await this.secrets.get('OPENROUTER_API_KEY');
      if (!key) throw new ConfigError('OPENROUTER_API_KEY is not configured');
      return new OpenRouterProvider(key, {
        estimateCost: (model, tokensIn, tokensOut) =>
          this.priceBook.estimate(model, tokensIn, tokensOut),
      });
    }
    const key = await this.secrets.get('ANTHROPIC_API_KEY');
    if (!key) throw new ConfigError('ANTHROPIC_API_KEY is not configured');
    return new AnthropicProvider(key);
  }

  async embedder(): Promise<Embedder> {
    // Injected embedders (tests) always win. Otherwise embeddings are gated by
    // config: when disabled we throw BEFORE constructing the OpenAI client, so
    // the app makes ZERO OpenAI requests. All callers wrap this in try/catch and
    // degrade gracefully (memory/RAG simply returns no hits).
    if (this.overrides.embedder) return this.overrides.embedder;
    if (!this.config.embeddingsEnabled) {
      throw new ConfigError('Embeddings are disabled (set EMBEDDINGS_ENABLED=true to enable memory/RAG)');
    }
    if (this._embedder) return this._embedder;
    const openai = await this.llm('openai');
    this._embedder = new OpenAIEmbedder(openai);
    return this._embedder;
  }

  /**
   * Drop cached provider clients so the next resolve picks up changed secrets.
   * Call after persisting a new API key/PAT via SecretsProvider.set.
   */
  invalidateSecretCaches(): void {
    this.llmCache.clear();
    this._github = undefined;
    this._embedder = undefined;
  }
}
