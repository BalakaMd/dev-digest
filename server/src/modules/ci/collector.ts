import type { CiRefreshResult, GitHubClient, RepoRef, Verdict, WorkflowRunInfo } from '@devdigest/shared';
import { CI_ARTIFACT_MAX_BYTES, ciArtifactName } from '@devdigest/shared';
import { ConfigError, GitHubPermissionError } from '../../platform/errors.js';
import { readResultArtifact } from './artifact.js';
import { isGithubUrl, parseRepoSlug } from './helpers.js';
import type { CiInstallationRecord, CiLogger, CiRepositoryPort, InsertCiRunInput } from './types.js';

/** Look back this far before the last collection so late-finishing runs are not missed (Q-4). */
const COLLECT_MARGIN_MS = 24 * 60 * 60 * 1000;
/** Artifact downloads per installation per refresh; the rest is picked up by the next one. */
const MAX_DOWNLOADS_PER_INSTALLATION = 30;
const FAILED_CONCLUSIONS = new Set(['failure', 'timed_out', 'startup_failure']);
/** EC-38: only these conclusions yield a row; cancelled / skipped / other runs are ignored. */
const COLLECTED_CONCLUSIONS = new Set(['success', ...FAILED_CONCLUSIONS]);

export interface CiCollectorDeps {
  repo: CiRepositoryPort;
  github: () => Promise<GitHubClient>;
  now: () => Date;
}

interface Counts {
  reviewed: number;
  failed: number;
  duplicate: number;
  invalid: number;
}

/**
 * Pulls CI results (SPEC-09): for every installation of the workspace it re-evaluates the
 * installation status and, for installed ones, reads the finished `pull_request` runs of the
 * workflow file and downloads their result artifacts with the studio's GitHub token (AC-53,
 * AC-59). Nothing is accepted from outside — there is no inbound endpoint.
 */
export class CiCollector {
  private inflight = new Map<string, Promise<CiRefreshResult>>();

  constructor(private deps: CiCollectorDeps) {}

  /** Concurrent refreshes of one workspace share a single pass. */
  refresh(workspaceId: string, log?: CiLogger): Promise<CiRefreshResult> {
    const running = this.inflight.get(workspaceId);
    if (running) return running;
    const p = this.collectWorkspace(workspaceId, log).finally(() => this.inflight.delete(workspaceId));
    this.inflight.set(workspaceId, p);
    return p;
  }

  private async collectWorkspace(workspaceId: string, log?: CiLogger): Promise<CiRefreshResult> {
    const installations = await this.deps.repo.listInstallations(workspaceId);
    if (installations.length === 0) return { degraded: false, message: null };

    let github: GitHubClient;
    try {
      github = await this.deps.github();
    } catch (err) {
      const message =
        err instanceof ConfigError ? 'No GitHub token is configured.' : 'GitHub is not reachable.';
      return { degraded: true, message };
    }

    const problems: string[] = [];
    for (const inst of installations) {
      const problem = await this.collectInstallation(workspaceId, github, inst, log);
      if (problem) problems.push(`${inst.repo}: ${problem}`);
    }
    return problems.length
      ? { degraded: true, message: `Could not fully read GitHub — ${problems.join('; ')}` }
      : { degraded: false, message: null };
  }

  /** Returns a short problem text, or null when the installation was collected cleanly. */
  private async collectInstallation(
    workspaceId: string,
    github: GitHubClient,
    inst: CiInstallationRecord,
    log?: CiLogger,
  ): Promise<string | null> {
    const repoRef = parseRepoSlug(inst.repo);
    if (!repoRef) return null;
    const startedAt = this.deps.now();
    let status = inst.status;

    try {
      status = await this.evaluateStatus(workspaceId, github, repoRef, inst, startedAt);
    } catch (err) {
      return describeError(err);
    }
    if (status !== 'installed') return null; // EC-40: runs only exist for installed workflows

    const counts: Counts = { reviewed: 0, failed: 0, duplicate: 0, invalid: 0 };
    let complete = true;
    try {
      const since = new Date((inst.lastCollectedAt ?? inst.installedAt).getTime() - COLLECT_MARGIN_MS);
      const runs = await github.listWorkflowRuns(repoRef, {
        workflowPath: inst.workflowPath,
        since: since.toISOString(),
      });
      let downloads = 0;
      for (const run of runs) {
        if (!COLLECTED_CONCLUSIONS.has(run.conclusion ?? '')) continue; // EC-38
        if (await this.deps.repo.ciRunExists(workspaceId, inst.repo, String(run.id), run.run_attempt)) {
          counts.duplicate++;
          continue;
        }
        if (downloads >= MAX_DOWNLOADS_PER_INSTALLATION) {
          complete = false;
          break;
        }
        downloads++;
        const outcome = await this.ingestRun(workspaceId, github, repoRef, inst, run, log);
        counts[outcome]++;
      }
    } catch (err) {
      log?.warn({ repo: inst.repo, ...counts }, 'ci collect degraded');
      return describeError(err);
    }

    log?.info({ repo: inst.repo, installation_id: inst.id, ...counts }, 'ci collected');
    if (complete) await this.deps.repo.touchCollected(workspaceId, inst.id, startedAt);
    return null;
  }

  /** AC-40: the status is re-evaluated at every collection. */
  private async evaluateStatus(
    workspaceId: string,
    github: GitHubClient,
    repoRef: RepoRef,
    inst: CiInstallationRecord,
    now: Date,
  ): Promise<CiInstallationRecord['status']> {
    let next = inst.status;
    if ((inst.status === 'pr_open' || inst.status === 'pr_closed') && inst.prNumber != null) {
      const state = await github.getPullRequestState(repoRef, inst.prNumber);
      next = state === 'open' ? 'pr_open' : state === 'closed' ? 'pr_closed' : 'installed';
    }
    if (next === 'awaiting_manual') {
      const branch = await github.getDefaultBranch(repoRef);
      if (await github.fileExistsOnBranch(repoRef, inst.workflowPath, branch)) next = 'installed';
    }
    if (next !== inst.status) await this.deps.repo.updateStatus(workspaceId, inst.id, next, now);
    return next;
  }

  private async ingestRun(
    workspaceId: string,
    github: GitHubClient,
    repoRef: RepoRef,
    inst: CiInstallationRecord,
    run: WorkflowRunInfo,
    log?: CiLogger,
  ): Promise<keyof Counts> {
    const base = {
      agentId: inst.agentId,
      installationId: inst.id,
      repo: inst.repo,
      actionsRunId: String(run.id),
      actionsRunAttempt: run.run_attempt,
      actionsJobUrl: isGithubUrl(run.html_url) ? run.html_url : null,
      headSha: run.head_sha || null,
      ranAt: new Date(run.created_at),
    };
    const logCtx = {
      repo: inst.repo,
      installation_id: inst.id,
      run_id: run.id,
      attempt: run.run_attempt,
    };
    const failed = FAILED_CONCLUSIONS.has(run.conclusion ?? '');

    const artifact = await github.findRunArtifact(
      repoRef,
      run.id,
      ciArtifactName(inst.agentSlug, run.run_attempt),
    );
    if (!artifact || artifact.expired) {
      if (!failed) {
        log?.warn(
          { ...logCtx, reason: artifact ? 'artifact_expired' : 'artifact_missing' },
          'ci artifact invalid',
        );
        return 'invalid';
      }
      return (await this.deps.repo.insertCiRun(workspaceId, failedRow(base, run.pull_request_number)))
        ? 'failed'
        : 'duplicate';
    }

    if (artifact.size_bytes > CI_ARTIFACT_MAX_BYTES) {
      // NFR-2: decide on the declared size, before any download.
      log?.warn({ ...logCtx, reason: 'too_large' }, 'ci artifact invalid');
      return 'invalid';
    }

    const parsed = readResultArtifact(await github.downloadArtifact(repoRef, artifact.id));
    if (!parsed.ok) {
      log?.warn({ ...logCtx, reason: parsed.reason }, 'ci artifact invalid');
      return 'invalid';
    }
    if (parsed.result.agent !== inst.agentName) {
      // Q-3
      log?.warn({ ...logCtx, reason: 'agent_mismatch' }, 'ci artifact invalid');
      return 'invalid';
    }

    const r = parsed.result;
    const blockers = r.blockers ?? r.critical ?? null;
    const row: InsertCiRunInput = {
      ...base,
      prNumber: r.pr_number ?? run.pull_request_number,
      status: 'done',
      model: r.trace?.model ?? null,
      durationMs: r.duration_ms ?? null,
      costUsd: r.cost_usd,
      findingsCount: r.findings_count,
      blockers,
      verdict: r.verdict ?? deriveVerdict(blockers, r.findings_count),
      trace: r.trace ?? null,
    };
    return (await this.deps.repo.insertCiRun(workspaceId, row)) ? 'reviewed' : 'duplicate';
  }
}

type RowBase = Omit<
  InsertCiRunInput,
  'prNumber' | 'status' | 'model' | 'durationMs' | 'costUsd' | 'findingsCount' | 'blockers' | 'verdict' | 'trace'
>;

/** AC-52: a failed run without a result — no findings, cost or trace. */
function failedRow(base: RowBase, prNumber: number | null): InsertCiRunInput {
  return {
    ...base,
    prNumber,
    status: 'failed',
    model: null,
    durationMs: null,
    costUsd: null,
    findingsCount: null,
    blockers: null,
    verdict: null,
    trace: null,
  };
}

/** Used only when the artifact has no verdict; never re-evaluated against the current Fail CI on. */
function deriveVerdict(blockers: number | null, findings: number): Verdict {
  if (blockers != null && blockers > 0) return 'request_changes';
  return findings > 0 ? 'comment' : 'approve';
}

/** Short, token-free text for the refresh message. */
function describeError(err: unknown): string {
  if (err instanceof GitHubPermissionError) return 'the GitHub token lacks permission to read Actions';
  if (err instanceof ConfigError) return 'no GitHub token is configured';
  return 'GitHub request failed';
}
