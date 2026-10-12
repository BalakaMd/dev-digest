import { describe, it, expect } from 'vitest';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { eq } from 'drizzle-orm';
import { CI_RESULT_FILE_NAME, ciArtifactName } from '@devdigest/shared';
import { dockerAvailable } from '../helpers/pg.js';
import * as t from '../../src/db/schema.js';
import { MockGitHubClient, type MockGitHubOptions } from '../../src/adapters/mocks.js';
import { ExternalServiceError } from '../../src/platform/errors.js';
import { FAKE_TOKEN } from './fakes.js';
import { insertRepo, makeApp, uniq, useCiDb } from './it-env.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[ci routes] Docker not available — skipping integration tests.');
}

/**
 * T-23 — export to CI through the real app and a real Postgres, GitHub mocked (AC-8, AC-14,
 * AC-34, AC-37, AC-40, AC-47, AC-54, AC-56, EC-33, NG-1, NFR-1): preview -> zip install ->
 * refresh -> list; rename keeps the slug; a deleted agent keeps its runs; PR history is untouched.
 */
d('export to CI (routes + Postgres)', () => {
  const env = useCiDb();

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string, provider = 'openrouter') {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider, model: 'anthropic/claude-sonnet', system_prompt: 'Review the diff.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  const body = (repo: string, workflow?: string, extra: Record<string, unknown> = {}) => ({
    repo,
    triggers: ['opened', 'synchronize'],
    post_as: 'github_review',
    ...(workflow ? { workflow } : {}),
    ...extra,
  });

  it('runs the whole journey: preview, zip install, refresh, list, rename, re-refresh, agent delete (AC-37, AC-40, AC-47, AC-54, AC-56, AC-14, EC-33)', async () => {
    const repoName = `acme/${uniq('e2e-web')}`;
    await insertRepo(env, repoName);
    const agentName = uniq('E2E Reviewer');
    const slug = agentName.toLowerCase().replace(/[^a-z0-9]+/g, '-');
    const workflowPath = `.github/workflows/devdigest-review-${slug}.yml`;

    const run = {
      id: 987654,
      run_attempt: 1,
      conclusion: 'success',
      head_sha: 'cafebabe',
      html_url: `https://github.com/${repoName}/actions/runs/987654`,
      path: workflowPath,
      created_at: new Date().toISOString(),
      pull_request_number: 21,
    };
    const resultJson = {
      findings_count: 4,
      cost_usd: 0.05,
      duration_ms: 65_000,
      agent: agentName,
      pr_number: 21,
      verdict: 'request_changes',
      blockers: 1,
      trace: {
        manifest: { agent_version: 1, sha256: 'c'.repeat(64) },
        model: 'anthropic/claude-sonnet',
        runner_version: '1.0.0',
        reviewer_core_revision: 'rev123',
        node_version: 'v22.0.0',
        skill_hashes: [],
        head_sha: 'cafebabe',
      },
    };
    const ghOpts: MockGitHubOptions = {
      workflowRuns: [run],
      existingPaths: [workflowPath],
      artifacts: { [`${run.id}:${ciArtifactName(slug, 1)}`]: { id: 5001, size_bytes: 100, expired: false } },
      artifactBytes: { 5001: zipSync({ [CI_RESULT_FILE_NAME]: strToU8(JSON.stringify(resultJson)) }) },
    };
    const github = new MockGitHubClient(ghOpts);
    const app = await makeApp(env, { github, secrets: { GITHUB_TOKEN: FAKE_TOKEN } });
    const bodies: string[] = [];
    const call = async (method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) => {
      const res = await app.inject({ method, url, payload: payload as object | undefined });
      bodies.push(res.body);
      return res;
    };

    // PR run history of an unrelated PR, to prove CI rows never show up there (NG-1).
    const prRepo = await insertRepo(env, `acme/${uniq('prs')}`);
    const [pr] = await env.pg.handle.db
      .insert(t.pullRequests)
      .values({ workspaceId: env.workspaceId, repoId: prRepo.id, number: 1, title: 'T', author: 'dev', branch: 'f', base: 'main', headSha: 'a', additions: 1, deletions: 0, filesCount: 1, status: 'needs_review', body: '' })
      .returning();
    await env.pg.handle.db.insert(t.agentRuns).values({ workspaceId: env.workspaceId, prId: pr!.id, provider: 'openai', model: 'm', status: 'done', source: 'local' });
    const prRunsBefore = (await call('GET', `/pulls/${pr!.id}/runs`)).json();
    expect(prRunsBefore).toHaveLength(1);

    const agentId = await createAgent(app, agentName);

    // preview (AC-9: nothing is written to GitHub)
    const preview = await call('POST', `/agents/${agentId}/ci/preview`, body(repoName));
    expect(preview.statusCode).toBe(200);
    const pv = preview.json();
    expect(pv.agent_slug).toBe(slug);
    expect(pv.workflow_path).toBe(workflowPath);
    expect(github.committed).toEqual([]);
    const workflow = pv.files.find((f: { path: string }) => f.path === workflowPath).contents as string;

    // zip install (AC-37): no GitHub write, installation "awaiting manual install"
    const install = await call('POST', `/agents/${agentId}/ci/install`, body(repoName, workflow, { action: 'zip' }));
    expect(install.statusCode).toBe(200);
    const inst = install.json();
    expect(inst.installation).toMatchObject({ status: 'awaiting_manual', repo: repoName, agent_slug: slug });
    expect(Object.keys(unzipSync(new Uint8Array(Buffer.from(inst.zip_base64, 'base64')))).sort()).toEqual(
      pv.files.map((f: { path: string }) => f.path).sort(),
    );
    expect(github.committed).toEqual([]);
    expect(github.openedPrs).toEqual([]);

    // refresh: status -> installed (file on default branch), run collected (AC-40, AC-54)
    expect((await call('POST', '/ci/refresh')).json()).toEqual({ degraded: false, message: null });
    const list = (await call('GET', `/ci/runs?installation_id=${inst.installation.id}`)).json();
    expect(list.items).toHaveLength(1);
    expect(list.items[0]).toMatchObject({
      repo: repoName,
      pr_number: 21,
      pr_url: `https://github.com/${repoName}/pull/21`,
      agent_id: agentId,
      agent_name: agentName,
      verdict: 'request_changes',
      findings_count: 4,
      cost_usd: 0.05,
      duration_ms: 65_000,
      job_url: run.html_url,
    });
    const detail = (await call('GET', `/ci/runs/${list.items[0].id}`)).json();
    expect(detail).toMatchObject({ model: 'anthropic/claude-sonnet', head_sha: 'cafebabe' });
    expect(detail.trace.manifest).toEqual({ agent_version: 1, sha256: 'c'.repeat(64) });

    const installations = (await call('GET', `/agents/${agentId}/ci/installations`)).json();
    expect(installations).toHaveLength(1);
    expect(installations[0]).toMatchObject({ status: 'installed', latest_run: { id: list.items[0].id, verdict: 'request_changes' } });

    // refreshing again changes nothing (AC-56)
    await call('POST', '/ci/refresh');
    expect((await call('GET', `/ci/runs?installation_id=${inst.installation.id}`)).json().items).toHaveLength(1);
    expect(github.downloadedArtifacts).toHaveLength(1);

    // PR run history is unaffected (NG-1)
    expect((await call('GET', `/pulls/${pr!.id}/runs`)).json()).toEqual(prRunsBefore);

    // rename keeps the slug and the workflow path (AC-14)
    expect((await call('PUT', `/agents/${agentId}`, { name: uniq('Brand New Name') })).statusCode).toBe(200);
    const again = (await call('POST', `/agents/${agentId}/ci/preview`, body(repoName))).json();
    expect(again.agent_slug).toBe(slug);
    expect(again.workflow_path).toBe(workflowPath);

    // deleting the agent removes its installations but keeps the stored runs with no agent (EC-33)
    expect((await call('DELETE', `/agents/${agentId}`)).statusCode).toBeLessThan(300);
    const after = (await call('GET', `/ci/runs?installation_id=${inst.installation.id}`)).json();
    expect(after.items).toHaveLength(0); // installation row is gone, so the filter matches nothing
    const [kept] = await env.pg.handle.db.select().from(t.agentRuns).where(eq(t.agentRuns.actionsRunId, '987654'));
    expect(kept).toMatchObject({ source: 'ci', agentId: null, repo: repoName });
    const all = (await call('GET', '/ci/runs?limit=100')).json();
    expect(all.items.find((i: { id: string }) => i.id === kept!.id)).toMatchObject({ agent_id: null, agent_name: null, verdict: 'request_changes' });

    // the GitHub token never appears in any response (NFR-1)
    expect(bodies.join('\n')).not.toContain(FAKE_TOKEN);
    await app.close();
  });

  it('answers 422 for a non-OpenRouter agent and an unimported repository, 404 for an unknown run (AC-8)', async () => {
    const repoName = `acme/${uniq('guards')}`;
    await insertRepo(env, repoName);
    const app = await makeApp(env);
    const agentId = await createAgent(app, uniq('OpenAI Agent'), 'openai');

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/preview`, payload: body(repoName) });
    expect(res.statusCode).toBe(422);
    expect(res.json().error.message).toContain('CI runs use OpenRouter');

    const ok = await createAgent(app, uniq('Router Agent'));
    const foreign = await app.inject({ method: 'POST', url: `/agents/${ok}/ci/preview`, payload: body('someone/else') });
    expect(foreign.statusCode).toBe(422);

    const missing = await app.inject({ method: 'GET', url: '/ci/runs/00000000-0000-4000-8000-000000000000' });
    expect(missing.statusCode).toBe(404);
    await app.close();
  });

  it('a GitHub rejection returns GitHub\'s reason and the needed permissions, records no installation and leaks no token (AC-34, NFR-5, NFR-1)', async () => {
    const repoName = `acme/${uniq('denied')}`;
    await insertRepo(env, repoName);
    const github = new MockGitHubClient({
      commitError: new ExternalServiceError('Resource not accessible by personal access token', { status: 403 }),
    });
    const app = await makeApp(env, { github, secrets: { GITHUB_TOKEN: FAKE_TOKEN } });
    const agentId = await createAgent(app, uniq('Denied Agent'));
    const pv = (await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/preview`, payload: body(repoName) })).json();
    const workflow = pv.files.find((f: { path: string }) => f.path === pv.workflow_path).contents as string;

    const res = await app.inject({ method: 'POST', url: `/agents/${agentId}/ci/install`, payload: body(repoName, workflow, { action: 'open_pr' }) });

    expect(res.statusCode).toBe(502);
    expect(res.json().error.message).toBe('Resource not accessible by personal access token');
    expect(res.json().error.details.needed_permissions).toMatch(/workflow/i);
    expect(res.body).not.toContain(FAKE_TOKEN);
    expect((await app.inject({ method: 'GET', url: `/agents/${agentId}/ci/installations` })).json()).toEqual([]);
    await app.close();
  });
});
