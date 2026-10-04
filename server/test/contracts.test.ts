import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  Review,
  Finding,
  Intent,
  PrIntentRecord,
  BlastRadius,
  Risks,
  PrHistory,
  SmartDiff,
  Conformance,
  Onboarding,
  EvalRun,
  MemoryItem,
  RunTrace,
  Settings,
  Repo,
  PrDetail,
  Agent,
  Skill,
  AgentVersionConfig,
  ContextDocPaths,
  TourLanguage,
  SettingsUpdate,
  OnboardingTour,
  OnboardingTourState,
  OnboardingBlocked,
} from '@devdigest/shared';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';

/**
 * Contract tests — parse/round-trip the fixtures from data.jsx/data2.jsx
 * so feature agents can rely on the schemas matching the prototype data.
 */
describe('AI contracts parse fixtures', () => {
  it('Review + Finding (data.jsx VERDICT/FINDINGS)', () => {
    const review = Review.parse({
      verdict: 'request_changes',
      summary: 'Two blockers before merge.',
      score: 61,
      findings: [
        {
          id: 'f1',
          severity: 'CRITICAL',
          category: 'security',
          title: 'Hardcoded Stripe secret key in commit',
          file: 'src/config.ts',
          start_line: 12,
          end_line: 12,
          rationale: 'Line 12 contains a literal `sk_live_` Stripe key.',
          suggestion: 'Move to env and rotate.',
          confidence: 0.98,
          kind: 'secret_leak',
        },
      ],
    });
    expect(review.findings).toHaveLength(1);
    expect(review.score).toBe(61);
  });

  it('lethal-trifecta Finding variant', () => {
    const f = Finding.parse({
      id: 'f2',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Lethal trifecta',
      file: 'src/api/public/webhooks.ts',
      start_line: 61,
      end_line: 74,
      rationale: 'all three legs present',
      confidence: 0.79,
      kind: 'lethal_trifecta',
      trifecta_components: ['private_data_access', 'untrusted_input', 'exfil_path'],
      evidence: [{ component: 'untrusted_input', file: 'src/api/public/webhooks.ts', line: 61 }],
    });
    expect(f.trifecta_components).toContain('exfil_path');
  });

  it('Finding with and without scope', () => {
    const base = {
      id: 'f3',
      severity: 'WARNING' as const,
      category: 'bug' as const,
      title: 'Out of scope tweak',
      file: 'src/a.ts',
      start_line: 1,
      end_line: 1,
      rationale: 'r',
      confidence: 0.5,
    };
    expect(Finding.parse(base).scope).toBeUndefined();
    expect(Finding.parse({ ...base, scope: 'out' }).scope).toBe('out');
    expect(Finding.parse({ ...base, scope: null }).scope).toBeNull();
  });

  it('Intent / BlastRadius / Risks / PrHistory', () => {
    expect(() =>
      Intent.parse({ summary: 'x', in_scope: ['a'], out_of_scope: ['b'] }),
    ).not.toThrow();
    expect(() =>
      BlastRadius.parse({
        changed_symbols: [{ name: 'rateLimit', file: 'a.ts', kind: 'function' }],
        downstream: [
          {
            symbol: 'rateLimit',
            callers: [{ name: 'publicRouter', file: 'b.ts', line: 23 }],
            endpoints_affected: ['GET /x'],
            crons_affected: ['c'],
          },
        ],
        summary: 's',
      }),
    ).not.toThrow();
    expect(() =>
      Risks.parse({
        risks: [{ kind: 'security', title: 't', explanation: 'e', severity: 'high', file_refs: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      PrHistory.parse({
        history: [
          {
            pr_number: 401,
            title: 't',
            merged_at: '2026-03-18',
            author: 'a',
            files_overlap: [],
            notes: 'n',
          },
        ],
      }),
    ).not.toThrow();
  });

  it('PrIntentRecord round-trip', () => {
    const record = PrIntentRecord.parse({
      summary: 'Adds rate limiting to public endpoints.',
      in_scope: ['Add a token-bucket limiter'],
      out_of_scope: ['Auth changes'],
      pr_id: 'pr1',
      confidence: 'medium',
      sources: [
        { kind: 'title', ref: 'pr-title', status: 'used', bytes: 42, detail: null },
        { kind: 'plan', ref: 'docs/plan.md', status: 'unreachable', bytes: null, detail: '404' },
      ],
      head_sha: 'a1b2c3d4',
      stale: false,
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      tokens_in: 500,
      tokens_out: 80,
      cost_usd: null,
      derived_at: '2026-09-25T00:00:00Z',
    });
    expect(record.sources).toHaveLength(2);
    expect(record.cost_usd).toBeNull();
  });

  it('SmartDiff (data.jsx DIFF)', () => {
    const d = SmartDiff.parse({
      groups: [
        {
          role: 'core',
          files: [{ path: 'a.ts', additions: 84, deletions: 0, finding_lines: [28, 52] }],
        },
      ],
      split_suggestion: { too_big: false, total_lines: 285, proposed_splits: [] },
    });
    expect(d.groups[0]!.role).toBe('core');
  });

  it('Conformance / Onboarding / EvalRun / MemoryItem', () => {
    expect(() =>
      Conformance.parse({
        spec_id: 's1',
        spec_title: 'Spec',
        items: [{ requirement: 'r', status: 'implemented' }],
        completeness_pct: 80,
      }),
    ).not.toThrow();
    expect(() =>
      Onboarding.parse({
        sections: [{ kind: 'architecture', title: 'T', body: 'b', links: [] }],
      }),
    ).not.toThrow();
    expect(() =>
      EvalRun.parse({
        recall: 0.82,
        precision: 0.91,
        citation_accuracy: 0.95,
        traces_passed: 17,
        traces_total: 20,
        duration_ms: 12000,
        cost_usd: 0.23,
        per_trace: [{ name: 't01', pass: true, expected: 'x', actual: 'x' }],
      }),
    ).not.toThrow();
    expect(() =>
      MemoryItem.parse({
        content: 'c',
        scope: 'team',
        kind: 'decision',
        confidence: 0.92,
        sources: [{ pr: 401, context: 'ctx' }],
      }),
    ).not.toThrow();
  });

  it('RunTrace (data2.jsx TRACE single-document)', () => {
    const trace = RunTrace.parse({
      config: { agent: 'Security Reviewer', version: 'v7', model: 'gpt-4.1', pr: 482, source: 'local' },
      stats: {
        duration_ms: 8200,
        tokens_in: 14820,
        tokens_out: 1240,
        cost_usd: 0.06,
        findings: 3,
        grounding: '3/3 passed',
      },
      prompt_assembly: { system: 's', user: 'u' },
      tool_calls: [{ tool: 'read_file', args: "'src/config.ts'", meta: '1,240 bytes', ms: 120 }],
      raw_output: '{}',
      memory_pulled: [{ pr: 288, text: 'verified via stripe-signature' }],
      specs_read: ['specs/security-baseline.md'],
      log: [{ t: '00.00', kind: 'info', msg: 'started' }],
    });
    expect(trace.tool_calls).toHaveLength(1);
  });
});

describe('platform DTOs', () => {
  it('Settings defaults + passthrough', () => {
    const s = Settings.parse({ extra_key: 'x' });
    expect(s.theme).toBe('dark');
    expect((s as Record<string, unknown>).extra_key).toBe('x');
  });

  it('Repo + PrDetail', () => {
    expect(() =>
      Repo.parse({
        id: 'r1',
        workspace_id: 'w1',
        owner: 'acme',
        name: 'payments-api',
        full_name: 'acme/payments-api',
        default_branch: 'main',
        clone_path: null,
        last_polled_at: null,
        created_by: null,
      }),
    ).not.toThrow();
    expect(() =>
      PrDetail.parse({
        number: 482,
        title: 't',
        author: 'a',
        branch: 'b',
        base: 'main',
        head_sha: 'sha',
        additions: 1,
        deletions: 0,
        files_count: 1,
        status: 'open',
        files: [],
        commits: [],
      }),
    ).not.toThrow();
  });
});

/**
 * SPEC-01 contract additions (AC-24/25/26/37/38/48/75). Every new field is
 * optional or defaulted so legacy documents keep parsing.
 */
describe('project-context contracts', () => {
  const findingBase = {
    id: 'f1',
    severity: 'WARNING' as const,
    category: 'bug' as const,
    title: 'Direct db import',
    file: 'api/users.ts',
    start_line: 3,
    end_line: 3,
    rationale: 'r',
    confidence: 0.8,
  };

  const traceBase = {
    config: { agent: 'A', version: 'v1', model: 'gpt-4.1', pr: 1, source: 'local' },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0, findings: 0, grounding: '0/0 passed' },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '{}',
    memory_pulled: [],
    log: [],
  };

  it('Finding carries an optional cited_docs list (AC-48)', () => {
    expect(Finding.parse(findingBase).cited_docs).toBeUndefined();
    expect(Finding.parse({ ...findingBase, cited_docs: null }).cited_docs).toBeNull();
    expect(Finding.parse({ ...findingBase, cited_docs: ['specs/a.md', 'docs/b.md'] }).cited_docs).toEqual([
      'specs/a.md',
      'docs/b.md',
    ]);
    expect(() => Finding.parse({ ...findingBase, cited_docs: [1] })).toThrow();
  });

  it('a legacy RunTrace without `context` still parses; specs_read stays a list of strings (AC-37)', () => {
    const legacy = RunTrace.parse({ ...traceBase, specs_read: ['specs/a.md'] });
    expect(legacy.context).toBeUndefined();
    expect(legacy.specs_read).toEqual(['specs/a.md']);
    // `specs_read` must not turn into per-document objects.
    expect(() => RunTrace.parse({ ...traceBase, specs_read: [{ path: 'specs/a.md' }] })).toThrow();
  });

  it('RunTrace.context holds per-document path/source/tokens, the block total and skipped docs (AC-38)', () => {
    const trace = RunTrace.parse({
      ...traceBase,
      specs_read: ['specs/a.md', '.devdigest/docs/b.md'],
      context: {
        docs: [
          { path: 'specs/a.md', source: 'repo', tokens: 12 },
          { path: '.devdigest/docs/b.md', source: 'local', tokens: 30 },
        ],
        tokens: 42,
        skipped: [{ path: 'docs/c.md', reason: 'over_budget' }],
      },
    });
    expect(trace.context?.tokens).toBe(42);
    expect(trace.context?.docs.map((d) => d.source)).toEqual(['repo', 'local']);
    expect(trace.context?.skipped).toEqual([{ path: 'docs/c.md', reason: 'over_budget' }]);
    expect(RunTrace.parse({ ...traceBase, specs_read: [], context: null }).context).toBeNull();
    // source is a closed set
    expect(() =>
      RunTrace.parse({
        ...traceBase,
        specs_read: [],
        context: { docs: [{ path: 'a.md', source: 'remote', tokens: 1 }], tokens: 1, skipped: [] },
      }),
    ).toThrow();
  });

  it('Agent and Skill keep context_docs in order and tolerate its absence (AC-25)', () => {
    const agent = {
      id: 'a1',
      name: 'Reviewer',
      description: 'd',
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
      enabled: true,
      version: 1,
    };
    const parsedAgent = Agent.safeParse({ ...agent, context_docs: ['docs/z.md', 'specs/a.md'] });
    expect(parsedAgent.success).toBe(true);
    if (parsedAgent.success) expect(parsedAgent.data.context_docs).toEqual(['docs/z.md', 'specs/a.md']);
    const withoutDocs = Agent.safeParse(agent);
    expect(withoutDocs.success).toBe(true);
    if (withoutDocs.success) expect(withoutDocs.data.context_docs).toBeUndefined();

    const skill = {
      id: 's1',
      workspace_id: 'w1',
      name: 'rubric',
      description: 'd',
      type: 'rubric',
      body: 'b',
      source: 'manual',
      enabled: true,
      version: 1,
    };
    const parsedSkill = Skill.safeParse({ ...skill, context_docs: ['docs/b.md', 'docs/a.md'] });
    expect(parsedSkill.success).toBe(true);
    if (parsedSkill.success) expect(parsedSkill.data.context_docs).toEqual(['docs/b.md', 'docs/a.md']);
    expect(Skill.safeParse(skill).success).toBe(true);
  });

  it('an old agent-version snapshot without context_docs parses with [] (AC-75)', () => {
    const legacy = AgentVersionConfig.parse({
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
      strategy: 'single-pass',
      ci_fail_on: 'never',
      repo_intel: true,
      skills: [],
    });
    expect(legacy.context_docs).toEqual([]);
    const current = AgentVersionConfig.parse({
      provider: 'openai',
      model: 'gpt-4.1',
      system_prompt: 'p',
      strategy: 'single-pass',
      ci_fail_on: 'never',
      repo_intel: true,
      skills: [],
      context_docs: ['specs/a.md', 'specs/b.md'],
    });
    expect(current.context_docs).toEqual(['specs/a.md', 'specs/b.md']);
  });

  describe('ContextDocPaths (AC-4, AC-26)', () => {
    it('accepts repo-relative .md paths, including hidden folders, and keeps order', () => {
      const paths = ['.devdigest/specs/a.md', 'docs/specs/x.md', 'insights/notes.md'];
      expect(ContextDocPaths.parse(paths)).toEqual(paths);
      expect(ContextDocPaths.parse([])).toEqual([]);
    });

    it.each([
      ['absolute path', '/etc/passwd.md'],
      ['windows drive path', 'C:/docs/a.md'],
      ['parent segment', 'docs/../a.md'],
      ['leading parent segment', '../a.md'],
      ['NUL byte', 'docs/a\0.md'],
      ['backslash', 'docs\\a.md'],
      ['wrong extension', 'docs/a.txt'],
      ['no extension', 'docs/a'],
      ['empty path', ''],
      ['empty segment', 'docs//a.md'],
      ['over 512 chars', `docs/${'a'.repeat(510)}.md`],
    ])('rejects %s', (_label, path) => {
      expect(ContextDocPaths.safeParse([path]).success).toBe(false);
    });

    it('rejects a duplicate path and a 21st path, accepts exactly 20', () => {
      expect(ContextDocPaths.safeParse(['docs/a.md', 'docs/a.md']).success).toBe(false);
      const many = Array.from({ length: 21 }, (_, i) => `docs/${i}.md`);
      expect(ContextDocPaths.safeParse(many).success).toBe(false);
      expect(ContextDocPaths.safeParse(many.slice(0, 20)).success).toBe(true);
    });
  });
});

/**
 * SPEC-03 — Onboarding Tour contracts. `tour_language` is a fixed enum because
 * it is injected into the LLM prompt (AC-38, AC-42).
 */
describe('Onboarding Tour contracts', () => {
  it('TourLanguage accepts exactly English, Ukrainian, Hebrew', () => {
    expect(TourLanguage.options).toEqual(['English', 'Ukrainian', 'Hebrew']);
    expect(TourLanguage.safeParse('French').success).toBe(false);
    expect(TourLanguage.safeParse('english').success).toBe(false);
  });

  it('Settings defaults tour_language to English; SettingsUpdate rejects another value (AC-38, AC-42)', () => {
    expect(Settings.parse({}).tour_language).toBe('English');
    expect(SettingsUpdate.parse({ tour_language: 'Hebrew' }).tour_language).toBe('Hebrew');
    expect(() => SettingsUpdate.parse({ tour_language: 'French' })).toThrow();
  });

  it('OnboardingTour round-trips with nullable sections and an always-present run.commands', () => {
    const tour = OnboardingTour.parse({
      generated_at: '2026-10-04T10:00:00.000Z',
      language: 'Ukrainian',
      indexed_files: 42,
      provider: 'openrouter',
      model: 'm',
      architecture: null,
      critical_paths: [{ path: 'src/a.ts', reason: null, imported_by: 3, imports: 1 }],
      run: { commands: [] },
      reading_path: null,
      first_tasks: null,
    });
    expect(tour.run.commands).toEqual([]);
    expect(tour.critical_paths![0]!.reason).toBeNull();
    expect(OnboardingTour.safeParse({ ...tour, run: undefined }).success).toBe(false);
    expect(OnboardingTour.safeParse({ ...tour, language: 'French' }).success).toBe(false);
  });

  it('OnboardingBlocked / OnboardingTourState accept the documented reasons and reject unknown ones', () => {
    const blocked = {
      reason: 'partial',
      message: 'm',
      index_status: 'partial',
      files_indexed: 3,
    };
    expect(OnboardingBlocked.parse(blocked).reason).toBe('partial');
    expect(OnboardingBlocked.safeParse({ ...blocked, reason: 'other' }).success).toBe(false);

    const state = OnboardingTourState.parse({
      tour: null,
      generation: { status: 'idle', started_at: null, error: null },
      blocked: null,
      missing_key: { provider: 'openrouter' },
      tour_language: 'English',
      language_changed: false,
      index_changed: false,
      repo: { full_name: 'o/r', default_branch: 'main' },
    });
    expect(state.missing_key?.provider).toBe('openrouter');
  });
});

describe('PUT /settings — tour_language validation (AC-42, 422 shape)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      config: loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv),
    });
  });
  afterAll(async () => {
    await app.close();
  });

  it('rejects a language outside the enum with 422 validation_error before the handler runs', async () => {
    const res = await app.inject({
      method: 'PUT',
      url: '/settings',
      payload: { tour_language: 'French' },
    });
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error.code).toBe('validation_error');
    expect(JSON.stringify(body.error.details)).toContain('tour_language');
  });
});
