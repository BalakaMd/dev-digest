import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { CiResultArtifact, CI_RUNNER_ENV } from '@devdigest/shared';
import type { Review } from '@devdigest/shared';

/**
 * CLI-level tests for `main()` - the env contract the generated workflow relies
 * on (DEVDIGEST_AGENT_SLUG / DEVDIGEST_POST_AS / DEVDIGEST_RESULT_PATH). The
 * real `OpenRouterProvider` is replaced by a stub so no model call can happen,
 * and the global `fetch` is stubbed so no GitHub call can happen.
 */

const REVIEW: Review = {
  verdict: 'approve',
  summary: 's',
  score: 90,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded key',
      file: 'src/config.ts',
      start_line: 10,
      end_line: 10,
      rationale: 'literal key',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

const llmCalls = vi.hoisted(() => ({ count: 0, keys: [] as string[] }));

vi.mock('@devdigest/reviewer-core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@devdigest/reviewer-core')>();
  class StubProvider {
    readonly id = 'openrouter';
    constructor(apiKey: string) {
      llmCalls.keys.push(apiKey);
    }
    async completeStructured() {
      llmCalls.count++;
      return {
        data: REVIEW,
        model: 'm',
        tokensIn: 1,
        tokensOut: 1,
        costUsd: 0.001,
        raw: '{}',
        attempts: 1,
      };
    }
    async listModels() {
      return [];
    }
    async complete() {
      throw new Error('unused');
    }
    async embed() {
      return [];
    }
  }
  return { ...actual, OpenRouterProvider: StubProvider };
});

import { main } from './index.js';

const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -9,3 +9,4 @@
 host: 'localhost',
+apiKey: 'sk_live_abcdef123456',
 port: 3000,
 timeout: 30,
`;

const MANIFEST = (name: string) => `
name: "${name}"
version: 2
provider: "openrouter"
model: "deepseek/deepseek-v4-flash"
system_prompt: "Review."
skills: []
strategy: "single-pass"
ci_fail_on: "critical"
`;

describe('main() env contract (AC-61, AC-21, AC-63)', () => {
  let dir: string;
  let resultPath: string;
  let fetchCalls: { url: string; method: string }[];
  let logged: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'devdigest-runner-main-'));
    mkdirSync(path.join(dir, 'agents'), { recursive: true });
    writeFileSync(path.join(dir, 'agents', 'first.yaml'), MANIFEST('First Agent'));
    writeFileSync(path.join(dir, 'agents', 'second.yaml'), MANIFEST('Second Agent'));
    writeFileSync(
      path.join(dir, 'event.json'),
      JSON.stringify({ pull_request: { number: 9, title: 't', body: 'b', head: { sha: 'abc123' } } }),
    );
    resultPath = path.join(dir, 'out', 'result.json');
    mkdirSync(path.dirname(resultPath), { recursive: true });

    llmCalls.count = 0;
    llmCalls.keys = [];
    fetchCalls = [];
    vi.stubGlobal('fetch', async (input: unknown, init?: RequestInit) => {
      const method = init?.method ?? 'GET';
      fetchCalls.push({ url: String(input), method });
      return new Response(method === 'GET' ? DIFF : '{}', { status: 200 });
    });
    logged = [];
    for (const m of ['log', 'info', 'warn', 'error'] as const) {
      vi.spyOn(console, m).mockImplementation((...args: unknown[]) => {
        logged.push(args.map(String).join(' '));
      });
    }
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    rmSync(dir, { recursive: true, force: true });
  });

  const env = (extra: Record<string, string> = {}): NodeJS.ProcessEnv => ({
    DEVDIGEST_DIR: dir,
    GITHUB_REPOSITORY: 'acme/widgets',
    GITHUB_EVENT_PATH: path.join(dir, 'event.json'),
    GITHUB_TOKEN: 'ghp_FAKEFAKEFAKEFAKEFAKE',
    OPENROUTER_API_KEY: 'sk-or-v1-FAKEFAKEFAKEFAKE',
    [CI_RUNNER_ENV.RESULT_PATH]: resultPath,
    ...extra,
  });

  it('AC-61: exits 1 with a message naming the variable when the agent slug is not set, touching neither model nor GitHub', async () => {
    const code = await main(env());

    expect(code).toBe(1);
    expect(logged.join('\n')).toContain(CI_RUNNER_ENV.AGENT_SLUG);
    expect(llmCalls.count).toBe(0);
    expect(fetchCalls).toHaveLength(0);
    expect(existsSync(resultPath)).toBe(false);
  });

  it('AC-61 + AC-60: a slug without a manifest file exits 1 with the expected path, before any model call', async () => {
    const code = await main(env({ [CI_RUNNER_ENV.AGENT_SLUG]: 'ghost' }));

    expect(code).toBe(1);
    expect(logged.join('\n')).toMatch(/\.devdigest\/agents\/ghost\.yaml/);
    expect(llmCalls.count).toBe(0);
    expect(existsSync(resultPath)).toBe(false);
  });

  it('AC-61 + AC-21 + AC-62 + AC-63: runs the slug-selected agent, writes to DEVDIGEST_RESULT_PATH, posts nothing for "none", exits 1 on the gate, leaks no secrets', async () => {
    const code = await main(
      env({ [CI_RUNNER_ENV.AGENT_SLUG]: 'second', [CI_RUNNER_ENV.POST_AS]: 'none' }),
    );

    expect(code).toBe(1); // grounded CRITICAL finding under ci_fail_on: critical
    expect(llmCalls.count).toBe(1);
    expect(fetchCalls.filter((c) => c.method === 'POST')).toHaveLength(0);

    const text = readFileSync(resultPath, 'utf8');
    const artifact = CiResultArtifact.parse(JSON.parse(text));
    expect(artifact.agent).toBe('Second Agent');
    expect(artifact.verdict).toBe('request_changes');
    expect(artifact.trace?.head_sha).toBe('abc123');

    const everything = [text, ...logged].join('\n');
    expect(everything).not.toContain('ghp_FAKEFAKEFAKEFAKEFAKE');
    expect(everything).not.toContain('sk-or-v1-FAKEFAKEFAKEFAKE');
  });

  it('AC-21: DEVDIGEST_POST_AS=pr_comment posts exactly one issue comment', async () => {
    await main(env({ [CI_RUNNER_ENV.AGENT_SLUG]: 'first', [CI_RUNNER_ENV.POST_AS]: 'pr_comment' }));

    const posts = fetchCalls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0]!.url).toContain('/issues/9/comments');
  });
});
