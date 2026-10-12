import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { CI_BRANCH } from '@devdigest/shared';
import { MockGitHubClient } from '../../src/adapters/mocks.js';
import { ExternalServiceError, ValidationError } from '../../src/platform/errors.js';
import { CI_REQUIRED_TOKEN_PERMISSIONS } from '../../src/modules/ci/constants.js';
import { FAKE_TOKEN, makeAgent, makeLogger, makeServiceFixture, previewInput, REPO } from './fakes.js';

/**
 * T-16 install via PR (AC-30…AC-32, EC-15, EC-16, EC-29, NFR-6), T-17 failures and
 * no-token (AC-34, AC-36, EC-17, EC-19, NFR-5), T-18 secret and risk refusals
 * (AC-68, AC-75), T-19 zip install (AC-37, EC-40).
 */
type Fx = ReturnType<typeof makeServiceFixture>;

async function installInput(fx: Fx, agentId: string, action: 'zip' | 'open_pr', edit?: (wf: string) => string) {
  const p = await fx.service.preview('ws', agentId, previewInput);
  const generated = p.files.find((f) => f.path === p.workflow_path)!.contents!;
  return { preview: p, input: { ...previewInput, workflow: edit ? edit(generated) : generated, action, acknowledge_risk: false } };
}

describe('install via pull request', () => {
  it('commits exactly the Preview files (edited workflow included) as one commit on devdigest/ci and opens a PR into the reported default branch (AC-30, NFR-6)', async () => {
    const github = new MockGitHubClient({ defaultBranch: 'trunk' });
    const fx = makeServiceFixture({ github, skills: [{ name: 'Auth', body: '# auth' }], agent: makeAgent({ version: 5 }) });
    const { preview, input } = await installInput(fx, 'agent-1', 'open_pr', (wf) => `# edited by user\n${wf}`);
    const log = makeLogger();

    const result = await fx.service.install('ws', 'agent-1', input, log);

    expect(github.committed).toHaveLength(1);
    const commit = github.committed[0]!;
    expect(commit).toMatchObject({ branch: CI_BRANCH, base: 'trunk', fromBase: true });
    expect(commit.files.map((f) => f.path)).toEqual(preview.files.map((f) => f.path));
    expect(commit.files.find((f) => f.path === preview.workflow_path)!.contents.startsWith('# edited by user\n')).toBe(true);
    expect(commit.files.find((f) => f.path === '.devdigest/memory.jsonl')!.contents).toBe('');

    expect(github.openedPrs).toHaveLength(1);
    expect(github.openedPrs[0]).toMatchObject({ title: 'Add DevDigest CI review', head: CI_BRANCH, base: 'trunk' });

    expect(result.pr_url).toBe('https://github.com/mock/mock/pull/1');
    expect(result.zip_base64).toBeNull();
    expect(result.files_count).toBe(preview.files.length);
    expect(result.installation).toMatchObject({
      repo: REPO,
      status: 'pr_open',
      exported_agent_version: 5,
      triggers: ['opened', 'synchronize'],
      post_as: 'github_review',
      workflow_path: preview.workflow_path,
    });
    expect(fx.repo.installations).toHaveLength(1);
    expect(fx.repo.installations[0]).toMatchObject({ prNumber: 1, agentName: 'Security Reviewer' });

    const line = log.lines.find((l) => l.msg.includes('install'))!;
    expect(line.obj).toEqual({ repo: REPO, branch: CI_BRANCH, pr_url: 'https://github.com/mock/mock/pull/1' });
    expect(JSON.stringify(log.lines)).not.toContain(FAKE_TOKEN);
  });

  it('a second agent while the PR is open adds a commit on the same branch, opens no second PR and leaves the first agent\'s files alone (AC-31, AC-76, EC-15, EC-29)', async () => {
    const fx = makeServiceFixture();
    fx.agents.set('agent-2', makeAgent({ id: 'agent-2', name: 'Style Bot' }));
    fx.skills.set('agent-2', []);

    const first = await installInput(fx, 'agent-1', 'open_pr');
    const r1 = await fx.service.install('ws', 'agent-1', first.input);
    const second = await installInput(fx, 'agent-2', 'open_pr');
    const r2 = await fx.service.install('ws', 'agent-2', second.input);

    expect(fx.github.openedPrs).toHaveLength(1);
    expect(r2.pr_url).toBe(r1.pr_url);
    expect(fx.github.committed).toHaveLength(2);
    expect(fx.github.committed[1]).toMatchObject({ branch: CI_BRANCH, fromBase: false });
    const secondPaths = fx.github.committed[1]!.files.map((f) => f.path);
    expect(secondPaths).toContain('.github/workflows/devdigest-review-style-bot.yml');
    expect(secondPaths).not.toContain(first.preview.workflow_path);
    expect(secondPaths).not.toContain('.devdigest/agents/security-reviewer.yaml');
    expect(fx.repo.installations.map((i) => i.workflowPath).sort()).toEqual([
      '.github/workflows/devdigest-review-security-reviewer.yml',
      '.github/workflows/devdigest-review-style-bot.yml',
    ]);
  });
});

describe('install failures and missing token', () => {
  it('a GitHub rejection stays an error with GitHub\'s reason and the needed token permissions, records no installation, and a retry succeeds (AC-34, EC-17, NFR-5)', async () => {
    class FlakyGitHub extends MockGitHubClient {
      failNext: Error | null = new ExternalServiceError('Resource not accessible by personal access token', { status: 403 });
      override async commitFiles(...args: Parameters<MockGitHubClient['commitFiles']>) {
        if (this.failNext) {
          const e = this.failNext;
          this.failNext = null;
          throw e;
        }
        return super.commitFiles(...args);
      }
    }
    const github = new FlakyGitHub();
    const fx = makeServiceFixture({ github });
    const { input } = await installInput(fx, 'agent-1', 'open_pr');

    const err = (await fx.service.install('ws', 'agent-1', input).catch((e: unknown) => e)) as ExternalServiceError;
    expect(err).toBeInstanceOf(ExternalServiceError);
    expect(err.message).toBe('Resource not accessible by personal access token');
    expect(err.details).toMatchObject({ status: 403, needed_permissions: CI_REQUIRED_TOKEN_PERMISSIONS });
    expect(CI_REQUIRED_TOKEN_PERMISSIONS).toMatch(/workflow/i);
    expect(fx.repo.installations).toEqual([]);
    expect(fx.repo.upsertCalls).toBe(0);

    const ok = await fx.service.install('ws', 'agent-1', input);
    expect(ok.installation.status).toBe('pr_open');
    expect(fx.repo.installations).toHaveLength(1);
  });

  it('a failure while opening the PR also leaves no installation (NFR-5)', async () => {
    const github = new MockGitHubClient({ openPrError: new ExternalServiceError('Validation Failed', { status: 422 }) });
    const fx = makeServiceFixture({ github });
    const { input } = await installInput(fx, 'agent-1', 'open_pr');
    await expect(fx.service.install('ws', 'agent-1', input)).rejects.toBeInstanceOf(ExternalServiceError);
    expect(fx.repo.installations).toEqual([]);
  });

  it('without a studio GitHub token the PR option is refused before any GitHub call, while the zip still works (AC-36, EC-19)', async () => {
    const fx = makeServiceFixture({ secrets: [] });
    const pr = await installInput(fx, 'agent-1', 'open_pr');
    const err = await fx.service.install('ws', 'agent-1', pr.input).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ValidationError);
    expect((err as ValidationError).message).toContain('Settings');
    expect(fx.githubCalls.n).toBe(0);
    expect(fx.repo.installations).toEqual([]);

    const zip = await fx.service.install('ws', 'agent-1', { ...pr.input, action: 'zip' });
    expect(zip.zip_base64).not.toBeNull();
    expect(fx.githubCalls.n).toBe(0);
  });
});

describe('install refusals (server-side re-validation)', () => {
  it('refuses both the PR and the zip when a file holds a key-like value, naming file and line with the value masked, before any GitHub call (AC-68, EC-35)', async () => {
    const fx = makeServiceFixture({
      agent: makeAgent({ systemPrompt: `Line one\nUse this token: ${FAKE_TOKEN}\nLine three` }),
      skills: [{ name: 'Auth', body: `# auth\nkey = "${FAKE_TOKEN}"\n` }],
    });
    for (const action of ['open_pr', 'zip'] as const) {
      const { input } = await installInput(fx, 'agent-1', action);
      const err = (await fx.service.install('ws', 'agent-1', input).catch((e: unknown) => e)) as ValidationError;
      expect(err).toBeInstanceOf(ValidationError);
      expect(err.statusCode).toBe(422);
      expect(err.message).toMatch(/\.devdigest\/agents\/security-reviewer\.yaml:\d+/);
      expect(err.message).toMatch(/\.devdigest\/skills\/auth\.md:2/);
      expect(JSON.stringify({ m: err.message, d: err.details })).not.toContain(FAKE_TOKEN);
    }
    expect(fx.githubCalls.n).toBe(0);
    expect(fx.github.committed).toEqual([]);
    expect(fx.repo.installations).toEqual([]);
  });

  it('a risky edited workflow without acknowledgement is refused with 422 naming each construct; with it the install goes through (AC-75, EC-9)', async () => {
    const fx = makeServiceFixture();
    const risky = (wf: string) => wf.replace('pull_request:', 'pull_request_target: {}\n  pull_request:').replace('contents: read', 'contents: write');
    const { input } = await installInput(fx, 'agent-1', 'zip', risky);

    const err = (await fx.service.install('ws', 'agent-1', input).catch((e: unknown) => e)) as ValidationError;
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(422);
    expect(err.message).toContain('pull_request_target');
    expect(err.message).toContain('contents: write');
    expect(fx.repo.installations).toEqual([]);

    const ok = await fx.service.install('ws', 'agent-1', { ...input, acknowledge_risk: true });
    expect(ok.installation.status).toBe('awaiting_manual');
  });

  it('refuses invalid YAML even when risk is acknowledged (AC-23)', async () => {
    const fx = makeServiceFixture();
    const { input } = await installInput(fx, 'agent-1', 'zip', () => 'on: [unclosed\n');
    await expect(fx.service.install('ws', 'agent-1', { ...input, acknowledge_risk: true })).rejects.toBeInstanceOf(
      ValidationError,
    );
  });
});

describe('install via zip', () => {
  it('zips exactly the Preview files with the edited workflow, makes no GitHub call and records "awaiting manual install" (AC-37, EC-40)', async () => {
    const fx = makeServiceFixture({ skills: [{ name: 'Auth', body: '# auth' }] });
    const { preview, input } = await installInput(fx, 'agent-1', 'zip', (wf) => `# edited by user\n${wf}`);

    const result = await fx.service.install('ws', 'agent-1', input);

    expect(fx.githubCalls.n).toBe(0);
    expect(fx.github.committed).toEqual([]);
    expect(fx.github.openedPrs).toEqual([]);
    expect(result.pr_url).toBeNull();
    expect(result.installation).toMatchObject({ status: 'awaiting_manual', pr_url: null });
    expect(fx.repo.installations[0]).toMatchObject({ status: 'awaiting_manual', prNumber: null });

    const files = unzipSync(new Uint8Array(Buffer.from(result.zip_base64!, 'base64')));
    expect(Object.keys(files).sort()).toEqual(preview.files.map((f) => f.path).sort());
    expect(result.files_count).toBe(preview.files.length);
    expect(strFromU8(files[preview.workflow_path]!).startsWith('# edited by user\n')).toBe(true);
    expect(files['.devdigest/memory.jsonl']!.byteLength).toBe(0);
    expect(strFromU8(files['.devdigest/runner/index.js']!)).toContain('mock devdigest runner');
  });
});
