import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { MockGitHubClient, MockRunnerBundle } from '../../src/adapters/mocks.js';
import { ValidationError } from '../../src/platform/errors.js';
import {
  FAKE_TOKEN,
  REPO,
  makeAgent,
  makeServiceFixture,
  previewInput,
} from './fakes.js';

/**
 * T-14 preview (AC-8…AC-10, AC-12, AC-13, AC-14, AC-70, AC-76, EC-3, EC-4),
 * T-15 secrets status (AC-26, EC-39) and T-24a preview speed (NFR-4) — service level,
 * in-memory repository, MockGitHubClient and MockRunnerBundle.
 */
const skills = [
  { name: 'SQL Review', body: '# sql\nCheck queries.' },
  { name: 'sql review', body: '# sql 2\nSame slug as the first.' },
  { name: 'Auth', body: '# auth' },
];

describe('CiService.preview', () => {
  it('lists manifest, skills in order, an empty memory file, the runner and the editable workflow last — and calls GitHub never (AC-9, AC-10, AC-76, EC-7)', async () => {
    const fx = makeServiceFixture({ skills });
    const p = await fx.service.preview('ws', 'agent-1', previewInput);

    expect(p.files.map((f) => f.path)).toEqual([
      '.devdigest/agents/security-reviewer.yaml',
      '.devdigest/skills/sql-review.md',
      '.devdigest/skills/sql-review-2.md',
      '.devdigest/skills/auth.md',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      '.devdigest/runner/package.json',
      '.github/workflows/devdigest-review-security-reviewer.yml',
    ]);
    expect(p.workflow_path).toBe('.github/workflows/devdigest-review-security-reviewer.yml');
    expect(p.agent_slug).toBe('security-reviewer');

    const memory = p.files.find((f) => f.path === '.devdigest/memory.jsonl')!;
    expect(memory).toMatchObject({ contents: '', size_bytes: 0, editable: false, kind: 'text' });

    const runner = p.files.filter((f) => f.kind === 'bundle');
    expect(runner.map((f) => f.path)).toEqual(['.devdigest/runner/index.js', '.devdigest/runner/package.json']);
    expect(runner.every((f) => f.contents === null && f.size_bytes > 0 && !f.editable)).toBe(true);

    expect(p.files.filter((f) => f.editable).map((f) => f.path)).toEqual([p.workflow_path]);
    expect(fx.githubCalls.n).toBe(0);
    expect(fx.github.committed).toEqual([]);
  });

  it('builds the manifest from the saved agent, validated by the shared schema (AC-12, AC-13, EC-4)', async () => {
    const fx = makeServiceFixture({ skills, agent: makeAgent({ ciFailOn: 'warning', strategy: 'map-reduce', version: 7 }) });
    const p = await fx.service.preview('ws', 'agent-1', previewInput);
    const manifest = AgentManifest.parse(parse(p.files[0]!.contents!));
    expect(manifest).toMatchObject({
      name: 'Security Reviewer',
      version: 7,
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      skills: ['sql-review', 'sql-review-2', 'auth'],
      strategy: 'map-reduce',
      ci_fail_on: 'warning',
    });

    const none = makeServiceFixture();
    const q = await none.service.preview('ws', 'agent-1', previewInput);
    expect(q.files.some((f) => f.path.startsWith('.devdigest/skills/'))).toBe(false);
    expect(AgentManifest.parse(parse(q.files[0]!.contents!)).skills).toEqual([]);
  });

  it('returns an error instead of files when the manifest cannot be generated (AC-13)', async () => {
    const fx = makeServiceFixture({ agent: makeAgent({ name: '' }) });
    const err = await fx.service.preview('ws', 'agent-1', previewInput).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).statusCode).toBe(422);
  });

  it('rejects an agent whose provider is not openrouter with 422 and the reason, on preview, check and install (AC-8, EC-3)', async () => {
    for (const provider of ['openai', 'anthropic'] as const) {
      const fx = makeServiceFixture({ agent: makeAgent({ provider }) });
      const calls = [
        () => fx.service.preview('ws', 'agent-1', previewInput),
        () => fx.service.check('ws', 'agent-1', { ...previewInput, workflow: 'on: pull_request' }),
        () => fx.service.install('ws', 'agent-1', { ...previewInput, workflow: 'x', action: 'zip', acknowledge_risk: false }),
      ];
      for (const call of calls) {
        const err = await call().catch((e: unknown) => e);
        expect(err).toBeInstanceOf(ValidationError);
        expect((err as ValidationError).statusCode).toBe(422);
        expect((err as ValidationError).message).toContain('CI runs use OpenRouter');
      }
      expect(fx.repo.installations).toEqual([]);
    }
  });

  it('rejects a repository the workspace has not imported', async () => {
    const fx = makeServiceFixture();
    await expect(fx.service.preview('ws', 'agent-1', { ...previewInput, repo: 'evil/other' })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });

  it('counts the attached context documents for the "not carried into CI" note (AC-70)', async () => {
    const fx = makeServiceFixture({ agent: makeAgent({ contextDocsCount: 2 }) });
    expect((await fx.service.preview('ws', 'agent-1', previewInput)).context_docs_count).toBe(2);
  });

  it('reports whether a GitHub token is configured, without reading it (AC-36)', async () => {
    expect((await makeServiceFixture().service.preview('ws', 'agent-1', previewInput)).github_token_configured).toBe(true);
    const bare = makeServiceFixture({ secrets: [] });
    expect((await bare.service.preview('ws', 'agent-1', previewInput)).github_token_configured).toBe(false);
  });

  it('flags a key-like value in the prompt with file and line, masked (AC-68)', async () => {
    const fx = makeServiceFixture({ agent: makeAgent({ systemPrompt: `Use this token: ${FAKE_TOKEN}\nThen review.` }) });
    const p = await fx.service.preview('ws', 'agent-1', previewInput);
    expect(p.leaks).toHaveLength(1);
    expect(p.leaks[0]).toMatchObject({ path: '.devdigest/agents/security-reviewer.yaml' });
    expect(p.files[0]!.contents!.split('\n')[p.leaks[0]!.line - 1]).toContain('Use this token');
    expect(JSON.stringify(p.leaks)).not.toContain(FAKE_TOKEN);
    expect(p.leaks[0]!.masked).toContain('ghp_');
  });

  it('shows a 20-skill agent in well under 2 s (NFR-4)', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Skill ${i}`, body: `# skill ${i}\n${'x'.repeat(2000)}` }));
    const fx = makeServiceFixture({ skills: many, bundle: new MockRunnerBundle() });
    const t0 = performance.now();
    const p = await fx.service.preview('ws', 'agent-1', previewInput);
    const elapsed = performance.now() - t0;
    expect(p.files.filter((f) => f.path.startsWith('.devdigest/skills/'))).toHaveLength(20);
    expect(elapsed).toBeLessThan(2000);
  });
});

describe('agent slug stability (AC-14, Q-2)', () => {
  it('keeps the slug used at the first export after the agent is renamed, and gives a same-named second agent a suffix', async () => {
    const fx = makeServiceFixture();
    await fx.service.install('ws', 'agent-1', await withWorkflow(fx), undefined);
    expect(fx.repo.installations[0]).toMatchObject({ agentSlug: 'security-reviewer' });

    fx.agents.set('agent-1', makeAgent({ name: 'Completely New Name' }));
    const renamed = await fx.service.preview('ws', 'agent-1', previewInput);
    expect(renamed.agent_slug).toBe('security-reviewer');
    expect(renamed.workflow_path).toBe('.github/workflows/devdigest-review-security-reviewer.yml');

    fx.agents.set('agent-2', makeAgent({ id: 'agent-2', name: 'Security Reviewer' }));
    const other = await fx.service.preview('ws', 'agent-2', previewInput);
    expect(other.agent_slug).toBe('security-reviewer-2');
    expect(other.workflow_path).not.toBe(renamed.workflow_path);
  });
});

describe('CiService.secretsStatus', () => {
  it('answers set / not set from the repository\'s Actions secret names (AC-26)', async () => {
    const set = makeServiceFixture({ github: new MockGitHubClient({ secretNames: ['OPENROUTER_API_KEY', 'OTHER'] }) });
    expect(await set.service.secretsStatus('ws', 'agent-1', REPO)).toEqual({
      github_token_configured: true,
      openrouter_key: 'set',
    });
    const notSet = makeServiceFixture({ github: new MockGitHubClient({ secretNames: ['OTHER'] }) });
    expect((await notSet.service.secretsStatus('ws', 'agent-1', REPO)).openrouter_key).toBe('not_set');
  });

  it('answers "unknown" when the token may not read the names, instead of failing (AC-26, EC-39)', async () => {
    const fx = makeServiceFixture({ github: new MockGitHubClient({ secretNames: null }) });
    expect(await fx.service.secretsStatus('ws', 'agent-1', REPO)).toEqual({
      github_token_configured: true,
      openrouter_key: 'unknown',
    });
  });

  it('does not call GitHub when no token is configured', async () => {
    const fx = makeServiceFixture({ secrets: [] });
    expect(await fx.service.secretsStatus('ws', 'agent-1', REPO)).toEqual({
      github_token_configured: false,
      openrouter_key: 'unknown',
    });
    expect(fx.githubCalls.n).toBe(0);
  });
});

/** Install input built from the generated workflow of a preview. */
async function withWorkflow(fx: ReturnType<typeof makeServiceFixture>, action: 'zip' | 'open_pr' = 'zip') {
  const p = await fx.service.preview('ws', 'agent-1', previewInput);
  const workflow = p.files.find((f) => f.path === p.workflow_path)!.contents!;
  return { ...previewInput, workflow, action, acknowledge_risk: false };
}
