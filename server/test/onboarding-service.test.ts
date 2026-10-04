import { describe, it, expect, afterAll, beforeAll } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { OnboardingTourState, type OnboardingTour, type Provider, type TourLanguage } from '@devdigest/shared';
import { MockAuthProvider, MockGitClient, MockLLMProvider } from '../src/adapters/mocks.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { AppError } from '../src/platform/errors.js';
import { OnboardingService } from '../src/modules/onboarding/service.js';
import type {
  OnboardingRepoBasics,
  OnboardingRepositoryPort,
  StoredTour,
} from '../src/modules/onboarding/types.js';
import type { IndexState, OnboardingFacts } from '../src/modules/repo-intel/types.js';

/**
 * SPEC-03 — `OnboardingService` with an in-memory repository and a mock LLM
 * (no DB, no network). Every generation makes exactly ONE provider request,
 * rejections and attached requests make none (NFR-1), reading state computes
 * nothing (NFR-4).
 */

const WS = 'w1';
const REPO_ID = '5f0c1d2e-3a4b-4c5d-8e6f-7a8b9c0d1e2f';

const row = (path: string, rank: number, importedBy = 0, imports = 0) => ({ path, rank, importedBy, imports });

const FACTS: OnboardingFacts = {
  indexedPaths: ['src/core.ts', 'src/api.ts', 'README.md'],
  criticalPaths: [row('src/core.ts', 9, 7, 1)],
  readingPath: [row('src/core.ts', 9), row('src/api.ts', 8)],
};

const NARRATIVE = {
  architecture: { markdown: 'The `src/` folder holds everything.', diagram: null },
  critical_paths: [{ path: 'src/core.ts', reason: 'Imported by 7 files.' }],
  run_commands: ['pnpm dev'],
  reading_path: [
    { path: 'src/core.ts', reason: 'Start here.' },
    { path: 'src/api.ts', reason: 'Then the API.' },
  ],
  first_tasks: [{ description: 'Add a test', paths: ['src/core.ts'] }],
};

function oldTour(over: Partial<OnboardingTour> = {}): OnboardingTour {
  return {
    generated_at: '2026-01-01T00:00:00.000Z',
    language: 'English',
    indexed_files: 1,
    provider: 'openai',
    model: 'old-model',
    architecture: { markdown: 'OLD TOUR', diagram: null },
    critical_paths: null,
    run: { commands: [] },
    reading_path: null,
    first_tasks: null,
    ...over,
  };
}

function indexState(over: Partial<IndexState> = {}): IndexState {
  return {
    repoId: REPO_ID,
    status: 'full',
    filesIndexed: 10,
    filesSkipped: 0,
    durationMs: 1,
    lastIndexedSha: 'abc123',
    indexerVersion: 1,
    updatedAt: new Date('2026-02-01T00:00:00Z'),
    ...over,
  };
}

class MemoryRepo implements OnboardingRepositoryPort {
  stored: StoredTour | undefined;
  language: TourLanguage | undefined;
  basics: OnboardingRepoBasics | undefined = {
    id: REPO_ID,
    owner: 'acme',
    name: 'shop',
    fullName: 'acme/shop',
    defaultBranch: 'main',
    clonePath: '/clones/acme/shop',
  };
  async getRepo(ws: string, id: string) {
    return ws === WS && id === REPO_ID ? this.basics : undefined;
  }
  async getStoredTour() {
    return this.stored;
  }
  async saveTour(_ws: string, _id: string, tour: OnboardingTour, generatedAt: Date) {
    this.stored = { tour, generatedAt };
  }
  async getTourLanguage() {
    return this.language;
  }
}

/** Counts requests as they start, and holds the answer until `release()`. */
class GatedLLM extends MockLLMProvider {
  started = 0;
  private open!: () => void;
  private gate: Promise<void>;
  constructor(opts: ConstructorParameters<typeof MockLLMProvider>[1]) {
    super('openai', opts);
    this.gate = new Promise<void>((r) => (this.open = r));
  }
  release() {
    this.open();
  }
  override async completeStructured<T>(req: Parameters<MockLLMProvider['completeStructured']>[0]) {
    this.started += 1;
    await this.gate;
    return super.completeStructured(req) as Promise<never>;
  }
}

/** Throws like a provider that failed; still counts the request. */
class FailingLLM extends MockLLMProvider {
  started = 0;
  override async completeStructured<T>(_req: Parameters<MockLLMProvider['completeStructured']>[0]): Promise<never> {
    this.started += 1;
    throw new Error('503 upstream unavailable (key sk-abcdefghijkl)');
  }
}

interface Harness {
  svc: OnboardingService;
  repo: MemoryRepo;
  factsCalls: () => number;
  indexCalls: () => number;
  model: { provider: Provider; model: string };
  hasKey: { value: boolean };
  index: { state: IndexState };
  /** The provider the service resolves; reassign to change what the next generation talks to. */
  llm: { current: MockLLMProvider };
  logs: { level: string; obj: Record<string, unknown>; msg: string }[];
  logger: { info: (o: Record<string, unknown>, m: string) => void; error: (o: Record<string, unknown>, m: string) => void };
}

function harness(llm: MockLLMProvider): Harness {
  const repo = new MemoryRepo();
  let factsCalls = 0;
  let indexCalls = 0;
  const model = { provider: 'openai' as Provider, model: 'gpt-test' };
  const hasKey = { value: true };
  const index = { state: indexState() };
  const logs: Harness['logs'] = [];
  const llmRef = { current: llm };
  let tick = 0;
  const svc = new OnboardingService({
    repo,
    repoIntel: {
      getIndexState: async () => {
        indexCalls += 1;
        return index.state;
      },
      getOnboardingFacts: async () => {
        factsCalls += 1;
        return FACTS;
      },
    },
    git: new MockGitClient({ files: { 'README.md': 'Run `pnpm dev`.' } }),
    llm: async () => llmRef.current,
    resolveModel: async () => ({ ...model }),
    hasSecret: async () => hasKey.value,
    now: () => new Date(Date.UTC(2026, 9, 4, 12, 0, tick++)),
  });
  return {
    svc,
    repo,
    factsCalls: () => factsCalls,
    indexCalls: () => indexCalls,
    model,
    hasKey,
    index,
    llm: llmRef,
    logs,
    logger: {
      info: (obj, msg) => void logs.push({ level: 'info', obj, msg }),
      error: (obj, msg) => void logs.push({ level: 'error', obj, msg }),
    },
  };
}

const request = (llm: MockLLMProvider) =>
  llm.calls.filter((c) => c.method === 'completeStructured').map((c) => c.req as {
    model: string;
    singleAttempt?: boolean;
    maxRetries?: number;
    messages: { role: string; content: string }[];
  });

async function rejection(p: Promise<unknown>): Promise<AppError> {
  try {
    await p;
  } catch (e) {
    return e as AppError;
  }
  throw new Error('expected a rejection');
}

describe('OnboardingService.generate — one LLM request per generation', () => {
  it('success: exactly one single-attempt request, tour stored in the pinned language, replaces the old one (AC-15, AC-19, AC-39)', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    h.repo.language = 'Hebrew';
    h.repo.stored = { tour: oldTour(), generatedAt: new Date('2026-01-01T00:00:00Z') };

    const started = await h.svc.generate(WS, REPO_ID, h.logger);
    expect(started.generation.status).toBe('running');
    expect(started.tour?.architecture?.markdown).toBe('OLD TOUR'); // the earlier tour stays visible meanwhile
    await h.svc.whenIdle(WS, REPO_ID);

    const [req, ...more] = request(llm);
    expect(more).toHaveLength(0);
    expect(req!.singleAttempt).toBe(true);
    expect(req!.maxRetries).toBe(0);
    expect(req!.messages.map((m) => m.content).join('\n')).toContain('Hebrew');
    expect(req!.messages.find((m) => m.role === 'system')!.content).toContain('Hebrew');

    expect(h.repo.stored!.tour).toMatchObject({
      language: 'Hebrew',
      provider: 'openai',
      model: 'gpt-test',
      indexed_files: 10,
    });
    expect(h.repo.stored!.tour.architecture?.markdown).toContain('src/');
    expect(h.repo.stored!.generatedAt.getTime()).toBeGreaterThan(new Date('2026-01-01').getTime());

    const done = await h.svc.getState(WS, REPO_ID);
    expect(done.generation).toEqual({ status: 'idle', started_at: null, error: null });
    expect(done.tour?.language).toBe('Hebrew');
    expect(h.logs.map((l) => l.msg)).toEqual([
      'onboarding: generation started',
      'onboarding: generation finished',
    ]);
  });

  it('defaults to English when the language was never set (AC-38)', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    await h.svc.generate(WS, REPO_ID);
    await h.svc.whenIdle(WS, REPO_ID);
    expect(h.repo.stored!.tour.language).toBe('English');
    expect(request(llm)[0]!.messages.map((m) => m.content).join('\n')).toContain('English');
  });

  it('provider failure: still one request, earlier tour kept, error reported without secrets (AC-20, NFR-1)', async () => {
    const llm = new FailingLLM('openai');
    const h = harness(llm);
    const before = { tour: oldTour(), generatedAt: new Date('2026-01-01T00:00:00Z') };
    h.repo.stored = before;

    await h.svc.generate(WS, REPO_ID, h.logger);
    await h.svc.whenIdle(WS, REPO_ID);

    expect(llm.started).toBe(1);
    expect(h.repo.stored).toBe(before);
    const state = await h.svc.getState(WS, REPO_ID);
    expect(state.generation.status).toBe('failed');
    expect(state.generation.error).toContain('503');
    expect(state.generation.error).not.toContain('sk-abcdefghijkl');
    expect(state.tour?.architecture?.markdown).toBe('OLD TOUR');
    expect(h.logs.filter((l) => l.level === 'error')).toHaveLength(1);
  });

  it('unreadable output: one request, no second attempt, earlier tour kept (AC-20)', async () => {
    const llm = new MockLLMProvider('openai', { structured: { nonsense: true } });
    const h = harness(llm);
    h.repo.stored = { tour: oldTour(), generatedAt: new Date('2026-01-01T00:00:00Z') };

    await h.svc.generate(WS, REPO_ID);
    await h.svc.whenIdle(WS, REPO_ID);

    expect(request(llm)).toHaveLength(1);
    expect(h.repo.stored!.tour.architecture?.markdown).toBe('OLD TOUR');
    expect((await h.svc.getState(WS, REPO_ID)).generation.status).toBe('failed');
  });

  it('a new generation clears the earlier failure and then replaces the stored tour', async () => {
    const llm = new MockLLMProvider('openai', { structured: { nonsense: true } });
    const h = harness(llm);
    await h.svc.generate(WS, REPO_ID);
    await h.svc.whenIdle(WS, REPO_ID);
    expect((await h.svc.getState(WS, REPO_ID)).generation.status).toBe('failed');

    h.llm.current = new MockLLMProvider('openai', { structured: NARRATIVE });
    const restarted = await h.svc.generate(WS, REPO_ID);
    expect(restarted.generation).toMatchObject({ status: 'running', error: null });
    await h.svc.whenIdle(WS, REPO_ID);
    expect((await h.svc.getState(WS, REPO_ID)).generation.status).toBe('idle');
    expect(h.repo.stored!.tour.architecture?.markdown).toContain('src/');
  });
});

describe('OnboardingService.generate — language and model are read when the generation starts (AC-16, AC-39)', () => {
  it('a change made after the start does not affect that generation, but the next one uses it', async () => {
    const llm = new GatedLLM({ structured: NARRATIVE });
    const h = harness(llm);
    h.repo.language = 'Ukrainian';

    await h.svc.generate(WS, REPO_ID);
    // Settings change while the request is in flight.
    h.repo.language = 'Hebrew';
    h.model.model = 'gpt-newer';
    llm.release();
    await h.svc.whenIdle(WS, REPO_ID);

    expect(h.repo.stored!.tour).toMatchObject({ language: 'Ukrainian', model: 'gpt-test' });
    expect(request(llm)[0]!.model).toBe('gpt-test');

    // The stored tour is now behind the setting (AC-40) and nothing regenerates by itself.
    const state = await h.svc.getState(WS, REPO_ID);
    expect(state.language_changed).toBe(true);
    expect(state.tour_language).toBe('Hebrew');
    expect(llm.started).toBe(1);

    await h.svc.generate(WS, REPO_ID);
    await h.svc.whenIdle(WS, REPO_ID);
    expect(llm.started).toBe(2);
    expect(request(llm)[1]!.model).toBe('gpt-newer');
    expect(h.repo.stored!.tour.language).toBe('Hebrew');
  });
});

describe('OnboardingService.generate — attach to a running generation (AC-23)', () => {
  it('two requests for the same repository make one LLM request and both report running', async () => {
    const llm = new GatedLLM({ structured: NARRATIVE });
    const h = harness(llm);

    const [a, b] = await Promise.all([h.svc.generate(WS, REPO_ID), h.svc.generate(WS, REPO_ID)]);
    expect(a.generation.status).toBe('running');
    expect(b.generation.status).toBe('running');
    expect(b.generation.started_at).toBe(a.generation.started_at);

    llm.release();
    await h.svc.whenIdle(WS, REPO_ID);

    expect(llm.started).toBe(1);
    expect(h.factsCalls()).toBe(1);
    expect((await h.svc.getState(WS, REPO_ID)).tour).not.toBeNull();
  });
});

describe('OnboardingService.generate — rejected before any LLM request (AC-24, AC-34, NFR-1)', () => {
  it('no index row → 422 not_indexed, no facts, no LLM', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    // The facade's synthesised reply for a repo with no index row.
    h.index.state = indexState({
      status: 'degraded',
      degradedReason: 'no_data',
      lastIndexedSha: '',
      filesIndexed: 0,
    });
    const err = await rejection(h.svc.generate(WS, REPO_ID));
    expect(err.statusCode).toBe(422);
    expect(err.code).toBe('validation_error');
    expect(err.details).toMatchObject({ reason: 'not_indexed', index_status: 'none', files_indexed: 0 });
    expect(llm.calls).toHaveLength(0);
    expect(h.factsCalls()).toBe(0);
  });

  it('partial index, no working copy → 422 with the reason, no LLM', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    h.index.state = indexState({ status: 'partial' });
    expect((await rejection(h.svc.generate(WS, REPO_ID))).details).toMatchObject({ reason: 'partial' });

    h.index.state = indexState();
    h.repo.basics = { ...h.repo.basics!, clonePath: null };
    expect((await rejection(h.svc.generate(WS, REPO_ID))).details).toMatchObject({ reason: 'no_clone' });
    expect(llm.calls).toHaveLength(0);
  });

  it('no API key for the feature model provider → 422 missing_key naming the provider, no LLM', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    h.hasKey.value = false;
    const err = await rejection(h.svc.generate(WS, REPO_ID));
    expect(err.statusCode).toBe(422);
    expect(err.details).toEqual({ reason: 'missing_key', provider: 'openai' });
    expect(llm.calls).toHaveLength(0);
    expect(h.factsCalls()).toBe(0);
  });

  it('unknown repository → 404', async () => {
    const h = harness(new MockLLMProvider('openai', { structured: NARRATIVE }));
    const err = await rejection(h.svc.generate(WS, 'nope'));
    expect(err.statusCode).toBe(404);
  });
});

describe('OnboardingService.getState — reading never computes (AC-17, AC-22, NFR-4)', () => {
  it('returns the stored tour with no LLM request and no facts computation', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    h.repo.stored = { tour: oldTour(), generatedAt: new Date('2026-03-01T00:00:00Z') };

    const state = await h.svc.getState(WS, REPO_ID);
    expect(state.tour?.architecture?.markdown).toBe('OLD TOUR');
    expect(state.repo).toEqual({ full_name: 'acme/shop', default_branch: 'main' });
    expect(llm.calls).toHaveLength(0);
    expect(h.factsCalls()).toBe(0);
    // Stored tour is older than the index (updated 2026-02-01)? No: tour is newer → not stale.
    expect(state.index_changed).toBe(false);
  });

  it('shows the empty state (no tour, idle) without starting anything; flags a stale index (AC-35)', async () => {
    const llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    const h = harness(llm);
    const empty = await h.svc.getState(WS, REPO_ID);
    expect(empty).toMatchObject({
      tour: null,
      generation: { status: 'idle' },
      blocked: null,
      missing_key: null,
      tour_language: 'English',
    });

    h.repo.stored = { tour: oldTour(), generatedAt: new Date('2026-01-01T00:00:00Z') };
    expect((await h.svc.getState(WS, REPO_ID)).index_changed).toBe(true);
    expect(llm.calls).toHaveLength(0);
    expect(h.factsCalls()).toBe(0);
  });

  it('reports a blocked index and a missing key while still serving the stored tour (AC-24, AC-34)', async () => {
    const h = harness(new MockLLMProvider('openai', { structured: NARRATIVE }));
    h.repo.stored = { tour: oldTour(), generatedAt: new Date('2026-03-01T00:00:00Z') };
    h.index.state = indexState({ status: 'partial' });
    h.hasKey.value = false;
    const state = await h.svc.getState(WS, REPO_ID);
    expect(state.tour).not.toBeNull();
    expect(state.blocked?.reason).toBe('partial');
    expect(state.missing_key).toEqual({ provider: 'openai' });
  });

  it('shows the running generation to a page opened later (AC-33)', async () => {
    const llm = new GatedLLM({ structured: NARRATIVE });
    const h = harness(llm);
    await h.svc.generate(WS, REPO_ID);
    const reopened = await h.svc.getState(WS, REPO_ID);
    expect(reopened.generation.status).toBe('running');
    expect(reopened.generation.started_at).not.toBeNull();
    llm.release();
    await h.svc.whenIdle(WS, REPO_ID);
    expect(llm.started).toBe(1);
  });
});

describe('onboarding routes (inject, in-memory service)', () => {
  let app: FastifyInstance;
  let llm: MockLLMProvider;
  let h: Harness;

  beforeAll(async () => {
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
      overrides: { auth: new MockAuthProvider() },
    });
    llm = new MockLLMProvider('openai', { structured: NARRATIVE });
    h = harness(llm);
    // The container's lazy getter would build a DB-backed service; swap in the in-memory one.
    Object.defineProperty(app.container, 'onboarding', { value: h.svc });
  });
  afterAll(async () => {
    await app.close();
  });

  it('POST generate → 202 with a running state; GET → the stored tour (schema-valid)', async () => {
    const id = REPO_ID;
    const post = await app.inject({ method: 'POST', url: `/repos/${id}/onboarding/generate` });
    expect(post.statusCode).toBe(202);
    expect(OnboardingTourState.parse(post.json()).generation.status).toBe('running');
    await h.svc.whenIdle(WS, id);

    const get = await app.inject({ method: 'GET', url: `/repos/${id}/onboarding` });
    expect(get.statusCode).toBe(200);
    expect(OnboardingTourState.parse(get.json()).tour?.language).toBe('English');
    expect(request(llm)).toHaveLength(1);
  });

  it('POST generate while blocked → 422 body {error:{code:"validation_error", details:{reason,…}}} and no LLM request', async () => {
    h.index.state = indexState({ status: 'partial' });
    const before = request(llm).length;
    const res = await app.inject({ method: 'POST', url: `/repos/${REPO_ID}/onboarding/generate` });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe('validation_error');
    expect(body.error.details).toMatchObject({ reason: 'partial', index_status: 'partial' });
    expect(request(llm)).toHaveLength(before);
  });
});
