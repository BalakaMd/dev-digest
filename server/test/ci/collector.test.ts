import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import type { CiResultArtifact, WorkflowRunInfo } from '@devdigest/shared';
import { CI_ARTIFACT_MAX_BYTES, CI_RESULT_FILE_NAME, ciArtifactName } from '@devdigest/shared';
import { MockGitHubClient, type MockGitHubOptions } from '../../src/adapters/mocks.js';
import { CiCollector } from '../../src/modules/ci/collector.js';
import { ConfigError, ExternalServiceError } from '../../src/platform/errors.js';
import type { CiInstallationRecord } from '../../src/modules/ci/types.js';
import { FakeCiRepo, FAKE_TOKEN, NOW, REPO, makeLogger } from './fakes.js';

/**
 * T-20 — pull-based collector (AC-40, AC-48, AC-52, AC-54…AC-58, EC-24…EC-28, EC-38, NFR-2, NFR-6)
 * against MockGitHubClient and an in-memory repository. Nothing here touches the network.
 */
const SLUG = 'security-reviewer';
const WF_PATH = `.github/workflows/devdigest-review-${SLUG}.yml`;
const WS = 'ws-1';

const installation = (over: Partial<CiInstallationRecord> = {}): CiInstallationRecord => ({
  id: 'inst-1',
  agentId: 'agent-1',
  repo: REPO,
  targetType: 'gha',
  agentSlug: SLUG,
  agentName: 'Security Reviewer',
  workflowPath: WF_PATH,
  status: 'installed',
  statusChangedAt: new Date('2026-02-20T00:00:00Z'),
  installedAt: new Date('2026-02-20T00:00:00Z'),
  exportedAgentVersion: 3,
  triggers: ['opened', 'synchronize'],
  postAs: 'github_review',
  prUrl: null,
  prNumber: null,
  lastCollectedAt: null,
  ...over,
});

const result = (over: Partial<CiResultArtifact> = {}): CiResultArtifact => ({
  findings_count: 2,
  cost_usd: 0.02,
  duration_ms: 12_000,
  agent: 'Security Reviewer',
  pr_number: 9,
  verdict: 'comment',
  blockers: 0,
  trace: {
    manifest: { agent_version: 3, sha256: 'a'.repeat(64) },
    model: 'anthropic/claude-sonnet',
    runner_version: '1.0.0',
    reviewer_core_revision: 'abc123',
    node_version: 'v22.0.0',
    skill_hashes: [{ slug: 'auth', sha256: 'b'.repeat(64) }],
    head_sha: 'deadbeef',
  },
  ...over,
});

let runSeq = 100;
const run = (over: Partial<WorkflowRunInfo> = {}): WorkflowRunInfo => ({
  id: ++runSeq,
  run_attempt: 1,
  conclusion: 'success',
  head_sha: 'deadbeef',
  html_url: `https://github.com/${REPO}/actions/runs/${runSeq}`,
  path: WF_PATH,
  created_at: '2026-03-01T10:00:00Z',
  pull_request_number: 9,
  ...over,
});

function setup(opts: { installations?: CiInstallationRecord[]; github?: MockGitHubOptions } = {}) {
  const repo = new FakeCiRepo();
  repo.installations = opts.installations ?? [installation()];
  const ghOpts: MockGitHubOptions = { workflowRuns: [], artifacts: {}, artifactBytes: {}, ...opts.github };
  const github = new MockGitHubClient(ghOpts);
  const collector = new CiCollector({ repo, github: async () => github, now: () => NOW });
  let artifactId = 1000;
  /** Register a downloadable result artifact for a run. */
  const addArtifact = (r: WorkflowRunInfo, bytes: Uint8Array | CiResultArtifact | string, expired = false) => {
    const id = ++artifactId;
    const data =
      bytes instanceof Uint8Array
        ? bytes
        : zipSync({ [CI_RESULT_FILE_NAME]: strToU8(typeof bytes === 'string' ? bytes : JSON.stringify(bytes)) });
    ghOpts.artifacts![`${r.id}:${ciArtifactName(SLUG, r.run_attempt)}`] = { id, size_bytes: data.byteLength, expired };
    ghOpts.artifactBytes![id] = data;
  };
  const addRun = (r: WorkflowRunInfo) => void ghOpts.workflowRuns!.push(r);
  return { repo, github, collector, addArtifact, addRun, ghOpts };
}

describe('CiCollector — reviewed runs', () => {
  it('stores one done row per accepted result with the verdict the runner computed, blockers, trace, PR number and job link (AC-48, AC-54)', async () => {
    const t = setup();
    const r = run();
    t.addRun(r);
    // Zero blockers but findings: the stored verdict is the artifact's, not re-derived.
    t.addArtifact(r, result({ verdict: 'approve', findings_count: 3, blockers: 0 }));
    const log = makeLogger();

    const out = await t.collector.refresh(WS, log);

    expect(out).toEqual({ degraded: false, message: null });
    expect(t.repo.runs).toHaveLength(1);
    expect(t.repo.runs[0]).toMatchObject({
      agentId: 'agent-1',
      installationId: 'inst-1',
      repo: REPO,
      prNumber: 9,
      actionsRunId: String(r.id),
      actionsRunAttempt: 1,
      actionsJobUrl: r.html_url,
      headSha: 'deadbeef',
      status: 'done',
      model: 'anthropic/claude-sonnet',
      durationMs: 12_000,
      costUsd: 0.02,
      findingsCount: 3,
      blockers: 0,
      verdict: 'approve',
    });
    expect(t.repo.runs[0]!.trace?.manifest).toEqual({ agent_version: 3, sha256: 'a'.repeat(64) });
    expect(t.github.workflowRunQueries[0]!.q.workflowPath).toBe(WF_PATH);

    // NFR-6: per-installation counts, repo only, no secrets.
    const line = log.lines.find((l) => l.msg === 'ci collected')!;
    expect(line.obj).toEqual({ repo: REPO, installation_id: 'inst-1', reviewed: 1, failed: 0, duplicate: 0, invalid: 0 });
    expect(JSON.stringify(log.lines)).not.toContain(FAKE_TOKEN);
  });

  it('derives a verdict only when the artifact has none (older runner): blockers, then findings, then approve', async () => {
    const t = setup();
    const cases: Array<[Partial<CiResultArtifact>, string]> = [
      [{ verdict: null, blockers: 2, findings_count: 5 }, 'request_changes'],
      [{ verdict: null, blockers: 0, findings_count: 1 }, 'comment'],
      [{ verdict: null, blockers: null, findings_count: 0 }, 'approve'],
    ];
    for (const [over] of cases) {
      const r = run();
      t.addRun(r);
      t.addArtifact(r, result(over));
    }
    await t.collector.refresh(WS);
    expect(t.repo.runs.map((x) => x.verdict).sort()).toEqual(cases.map((c) => c[1]).sort());
  });

  it('keeps a job link only when it points to github.com (NFR-2)', async () => {
    const t = setup();
    const r = run({ html_url: 'javascript:alert(1)' });
    t.addRun(r);
    t.addArtifact(r, result());
    await t.collector.refresh(WS);
    expect(t.repo.runs[0]!.actionsJobUrl).toBeNull();
  });
});

describe('CiCollector — duplicates, attempts, foreign runs', () => {
  it('collecting twice keeps one row and downloads nothing the second time; a re-run attempt is a new row (AC-56, EC-26)', async () => {
    const t = setup();
    const r1 = run({ id: 555, run_attempt: 1 });
    t.addRun(r1);
    t.addArtifact(r1, result());

    await t.collector.refresh(WS);
    await t.collector.refresh(WS);
    expect(t.repo.runs).toHaveLength(1);
    expect(t.github.downloadedArtifacts).toHaveLength(1);

    const r2 = run({ id: 555, run_attempt: 2 });
    t.addRun(r2);
    t.addArtifact(r2, result({ findings_count: 0, verdict: 'approve' }));
    await t.collector.refresh(WS);
    expect(t.repo.runs.map((x) => x.actionsRunAttempt).sort()).toEqual([1, 2]);
  });

  it('discards a run of another workflow file and a result naming another agent, creating no row (AC-55, EC-25)', async () => {
    const t = setup();
    const foreign = run({ path: '.github/workflows/other.yml' });
    t.addRun(foreign);
    t.addArtifact(foreign, result());
    const wrongAgent = run();
    t.addRun(wrongAgent);
    t.addArtifact(wrongAgent, result({ agent: 'Some Other Agent' }));

    await t.collector.refresh(WS);

    expect(t.repo.runs).toEqual([]);
    expect(t.github.downloadedArtifacts).toHaveLength(1); // only the matching workflow path was read
  });
});

describe('CiCollector — failed runs and invalid artifacts', () => {
  it('stores a failed row without error text, findings, cost or trace for a failed run with no artifact (AC-52, EC-24)', async () => {
    const t = setup();
    const f = run({ conclusion: 'failure', head_sha: 'f00dcafe', pull_request_number: 12 });
    const timedOut = run({ conclusion: 'timed_out' });
    t.addRun(f);
    t.addRun(timedOut);

    await t.collector.refresh(WS);

    const row = t.repo.runs.find((x) => x.actionsRunId === String(f.id))!;
    expect(row).toMatchObject({
      status: 'failed',
      repo: REPO,
      prNumber: 12,
      headSha: 'f00dcafe',
      agentId: 'agent-1',
      actionsJobUrl: f.html_url,
      verdict: null,
      findingsCount: null,
      costUsd: null,
      durationMs: null,
      trace: null,
    });
    expect(row).not.toHaveProperty('error');
    expect(t.repo.runs).toHaveLength(2);
  });

  it('creates no row for skipped or cancelled runs, or a successful run without an artifact (AC-57, EC-38)', async () => {
    const t = setup();
    for (const conclusion of ['skipped', 'cancelled', 'success']) t.addRun(run({ conclusion }));
    await t.collector.refresh(WS);
    expect(t.repo.runs).toEqual([]);
  });

  it('skips an expired, a corrupt and an oversized artifact, logs them as invalid, and still stores the good run (AC-57, EC-27)', async () => {
    const t = setup();
    const expired = run();
    const corrupt = run();
    const huge = run();
    const good = run();
    for (const r of [expired, corrupt, huge, good]) t.addRun(r);
    t.addArtifact(expired, result(), true);
    t.addArtifact(corrupt, strToU8('not a zip'));
    t.addArtifact(huge, JSON.stringify(result({ agent: 'x'.repeat(1_048_577) })));
    t.addArtifact(good, result());
    const log = makeLogger();

    const out = await t.collector.refresh(WS, log);

    expect(out.degraded).toBe(false);
    expect(t.repo.runs.map((x) => x.actionsRunId)).toEqual([String(good.id)]);
    const line = log.lines.find((l) => l.msg === 'ci collected')!;
    expect(line.obj).toMatchObject({ reviewed: 1, invalid: 3, failed: 0, duplicate: 0 });
  });

  it.each([
    ['artifact_missing', (t: ReturnType<typeof setup>, r: WorkflowRunInfo) => void t.addRun(r)],
    [
      'artifact_expired',
      (t: ReturnType<typeof setup>, r: WorkflowRunInfo) => {
        t.addRun(r);
        t.addArtifact(r, result({ agent: FAKE_TOKEN }), true);
      },
    ],
    [
      'agent_mismatch',
      (t: ReturnType<typeof setup>, r: WorkflowRunInfo) => {
        t.addRun(r);
        t.addArtifact(r, result({ agent: FAKE_TOKEN }));
      },
    ],
  ])(
    'logs one "ci artifact invalid" warning with reason %s and the run ids, and leaks neither a token nor artifact content (AC-57, NFR-6)',
    async (reason, arrange) => {
      const t = setup();
      const r = run({ run_attempt: 2 });
      arrange(t, r);
      const log = makeLogger();

      await t.collector.refresh(WS, log);

      expect(t.repo.runs).toEqual([]);
      const warns = log.lines.filter((l) => l.level === 'warn' && l.msg === 'ci artifact invalid');
      expect(warns).toHaveLength(1);
      expect(warns[0]!.obj).toEqual({ repo: REPO, installation_id: 'inst-1', run_id: r.id, attempt: 2, reason });
      // The artifact's agent field carries the fake token: any logging of artifact content would leak it.
      expect(JSON.stringify(log.lines)).not.toContain(FAKE_TOKEN);
    },
  );

  it('ignores cancelled and skipped runs even when they have a result artifact: no row, no download, no counter, no cap use (EC-38)', async () => {
    const t = setup();
    // 31 ignorable runs first: were they counted against the 30-download cap, the good run below would be cut off.
    for (let i = 0; i < 31; i++) {
      const r = run({ conclusion: i % 2 ? 'skipped' : 'cancelled' });
      t.addRun(r);
      t.addArtifact(r, result());
    }
    const good = run();
    t.addRun(good);
    t.addArtifact(good, result());
    const log = makeLogger();

    await t.collector.refresh(WS, log);

    expect(t.repo.runs.map((x) => x.actionsRunId)).toEqual([String(good.id)]);
    expect(t.github.downloadedArtifacts).toHaveLength(1);
    const line = log.lines.find((l) => l.msg === 'ci collected')!;
    expect(line.obj).toMatchObject({ reviewed: 1, failed: 0, duplicate: 0, invalid: 0 });
    expect(t.repo.touched).toHaveLength(1); // the pass finished, so the watermark moved
  });

  it('does not download an artifact whose declared size exceeds the limit and counts it invalid; one exactly at the limit is still read (NFR-2)', async () => {
    const t = setup();
    const tooBig = run();
    const atLimit = run();
    t.addRun(tooBig);
    t.addRun(atLimit);
    t.addArtifact(tooBig, result());
    t.addArtifact(atLimit, result());
    // The declared size is what GitHub reports; the bytes themselves stay small and valid.
    t.ghOpts.artifacts![`${tooBig.id}:${ciArtifactName(SLUG, 1)}`]!.size_bytes = CI_ARTIFACT_MAX_BYTES + 1;
    t.ghOpts.artifacts![`${atLimit.id}:${ciArtifactName(SLUG, 1)}`]!.size_bytes = CI_ARTIFACT_MAX_BYTES;
    const tooBigId = t.ghOpts.artifacts![`${tooBig.id}:${ciArtifactName(SLUG, 1)}`]!.id;
    const atLimitId = t.ghOpts.artifacts![`${atLimit.id}:${ciArtifactName(SLUG, 1)}`]!.id;
    const log = makeLogger();

    await t.collector.refresh(WS, log);

    expect(t.github.downloadedArtifacts).toEqual([atLimitId]);
    expect(t.github.downloadedArtifacts).not.toContain(tooBigId);
    expect(t.repo.runs.map((x) => x.actionsRunId)).toEqual([String(atLimit.id)]);
    const line = log.lines.find((l) => l.msg === 'ci collected')!;
    expect(line.obj).toMatchObject({ reviewed: 1, invalid: 1, failed: 0, duplicate: 0 });
  });

  it('downloads at most 30 artifacts per installation per refresh and leaves the watermark so the next refresh finishes (rate bound)', async () => {
    const t = setup();
    for (let i = 0; i < 35; i++) {
      const r = run();
      t.addRun(r);
      t.addArtifact(r, result());
    }
    await t.collector.refresh(WS);
    expect(t.github.downloadedArtifacts).toHaveLength(30);
    expect(t.repo.runs).toHaveLength(30);
    expect(t.repo.touched).toEqual([]);

    await t.collector.refresh(WS);
    expect(t.repo.runs).toHaveLength(35);
    expect(t.github.downloadedArtifacts).toHaveLength(35);
    expect(t.repo.touched).toHaveLength(1);
  });
});

describe('CiCollector — GitHub trouble (AC-58, EC-28)', () => {
  it('reports degraded with a token-free message, keeps stored rows and the watermark, and adds nothing when listing fails', async () => {
    const t = setup();
    t.repo.runs.push({ ...(await storedRow()), id: 'old-1' });
    class Down extends MockGitHubClient {
      override async listWorkflowRuns(): Promise<WorkflowRunInfo[]> {
        throw new ExternalServiceError(`rate limited (token ${FAKE_TOKEN})`, { status: 403 });
      }
    }
    const collector = new CiCollector({ repo: t.repo, github: async () => new Down(), now: () => NOW });

    const out = await collector.refresh(WS);

    expect(out.degraded).toBe(true);
    expect(out.message).toBeTruthy();
    expect(out.message).not.toContain(FAKE_TOKEN);
    expect(t.repo.runs.map((x) => x.id)).toEqual(['old-1']);
    expect(t.repo.touched).toEqual([]);
  });

  it('a download failure mid-way keeps the runs already stored whole, stores no partial row and keeps the watermark', async () => {
    const t = setup();
    const ok = run({ created_at: '2026-03-01T09:00:00Z' });
    const broken = run({ created_at: '2026-03-01T10:00:00Z' });
    t.addRun(ok);
    t.addRun(broken);
    t.addArtifact(ok, result());
    t.addArtifact(broken, result());
    delete t.ghOpts.artifactBytes![t.ghOpts.artifacts![`${broken.id}:${ciArtifactName(SLUG, 1)}`]!.id]; // mock then throws on download

    const out = await t.collector.refresh(WS);

    expect(out.degraded).toBe(true);
    expect(t.repo.runs.map((x) => x.actionsRunId)).toEqual([String(ok.id)]);
    expect(t.repo.touched).toEqual([]);
  });

  it('reports degraded when no GitHub token is configured, without touching stored runs', async () => {
    const repo = new FakeCiRepo();
    repo.installations = [installation()];
    const collector = new CiCollector({
      repo,
      github: async () => {
        throw new ConfigError('GITHUB_TOKEN missing');
      },
      now: () => NOW,
    });
    expect(await collector.refresh(WS)).toEqual({ degraded: true, message: 'No GitHub token is configured.' });
  });
});

describe('CiCollector — installation status (AC-40, EC-40, EC-41)', () => {
  it('moves PR open to Installed when merged and to PR closed when closed without merge', async () => {
    const t = setup({
      installations: [
        installation({ id: 'merged', agentId: 'a1', repo: 'acme/a', status: 'pr_open', prNumber: 1 }),
        installation({ id: 'closed', agentId: 'a2', repo: 'acme/b', status: 'pr_open', prNumber: 2 }),
        installation({ id: 'open', agentId: 'a3', repo: 'acme/c', status: 'pr_open', prNumber: 3 }),
      ],
      github: { prStates: { 1: 'merged', 2: 'closed', 3: 'open' } },
    });
    await t.collector.refresh(WS);
    const status = Object.fromEntries(t.repo.installations.map((i) => [i.id, i.status]));
    expect(status).toEqual({ merged: 'installed', closed: 'pr_closed', open: 'pr_open' });
  });

  it('becomes Installed for a zip install once the workflow file is on the default branch, and reads runs only from then on (EC-40)', async () => {
    const t = setup({
      installations: [installation({ status: 'awaiting_manual' })],
      github: { existingPaths: [] },
    });
    await t.collector.refresh(WS);
    expect(t.repo.installations[0]!.status).toBe('awaiting_manual');
    expect(t.github.workflowRunQueries).toEqual([]);

    t.ghOpts.existingPaths!.push(WF_PATH);
    await t.collector.refresh(WS);
    expect(t.repo.installations[0]!.status).toBe('installed');
    expect(t.github.workflowRunQueries).toHaveLength(1);
  });
});

/** A stored CI run row for the "stored rows stay" assertions. */
async function storedRow() {
  const probe = new FakeCiRepo();
  await probe.insertCiRun(WS, {
    agentId: 'agent-1',
    installationId: 'inst-1',
    repo: REPO,
    prNumber: 1,
    actionsRunId: '1',
    actionsRunAttempt: 1,
    actionsJobUrl: null,
    headSha: 'x',
    ranAt: NOW,
    status: 'done',
    model: null,
    durationMs: null,
    costUsd: null,
    findingsCount: 0,
    blockers: 0,
    verdict: 'approve',
    trace: null,
  });
  const { id: _id, ...rest } = probe.runs[0]!;
  return rest;
}
