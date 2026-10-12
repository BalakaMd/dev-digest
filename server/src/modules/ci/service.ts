import type {
  CiCheckInput,
  CiCheckResult,
  CiInstallInput,
  CiInstallResult,
  CiInstallation,
  CiPreview,
  CiPreviewFile,
  CiPreviewInput,
  CiRunDetail,
  CiRunsPage,
  CiSecretLeak,
  CiSecretsStatus,
} from '@devdigest/shared';
import { CI_BRANCH, CI_RUNNER_DIR } from '@devdigest/shared';
import {
  AppError,
  ConfigError,
  ExternalServiceError,
  GitHubPermissionError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import { RunnerBundleMissingError } from '../../adapters/runner-bundle/types.js';
import { AGENT_SLUG_FALLBACK, CI_MEMORY_PATH, CI_REQUIRED_TOKEN_PERMISSIONS, SKILL_SLUG_FALLBACK } from './constants.js';
import { manifestPathFor, parseRepoSlug, skillPathFor, workflowPathFor } from './helpers.js';
import { buildManifestYaml } from './manifest.js';
import { scanFiles } from './secret-scan.js';
import { slugify, uniqueSlugs } from './slug.js';
import { checkWorkflow, hasRisks } from './workflow-check.js';
import { generateWorkflow } from './workflow.js';
import { buildInstallZip } from './zip.js';
import { decodeRunsCursor, encodeRunsCursor } from './run-cursor.js';
import type {
  CiAgent,
  CiInstallationRecord,
  CiLogger,
  CiServiceDeps,
} from './types.js';

const PR_TITLE = 'Add DevDigest CI review';
const DEFAULT_RUNS_LIMIT = 50;
const MAX_RUNS_LIMIT = 100;

/** The text files of an export (everything except the runner bundle). */
interface TextFile {
  path: string;
  contents: string;
  editable: boolean;
}

interface Prepared {
  agent: CiAgent;
  agentSlug: string;
  workflowPath: string;
  /** manifest, skills, empty memory file, workflow — in Preview order, runner excluded. */
  head: TextFile[];
  workflow: TextFile;
}

/**
 * Export to CI use cases (SPEC-09): preview, check, secrets status, install
 * (PR or zip) and the installation / CI run queries. Talks to the world through
 * explicit ports (`CiServiceDeps`) — never the Container.
 */
export class CiService {
  constructor(private deps: CiServiceDeps) {}

  // ------------------------------------------------------------------ preview

  /** AC-8…AC-14, AC-70, AC-76: the files an install would write. No GitHub call. */
  async preview(workspaceId: string, agentId: string, input: CiPreviewInput): Promise<CiPreview> {
    const p = await this.prepare(workspaceId, agentId, input, undefined);
    const runner = await this.runnerEntries();
    const textFile = (f: TextFile): CiPreviewFile => ({
      path: f.path,
      editable: f.editable,
      kind: 'text',
      contents: f.contents,
      size_bytes: Buffer.byteLength(f.contents),
    });
    const files: CiPreviewFile[] = [
      ...p.head.map(textFile),
      ...runner.map((r) => ({
        path: `${CI_RUNNER_DIR}${r.path}`,
        editable: false,
        kind: 'bundle' as const,
        contents: null,
        size_bytes: r.size_bytes,
      })),
      textFile(p.workflow),
    ];
    return {
      agent_slug: p.agentSlug,
      workflow_path: p.workflowPath,
      files,
      context_docs_count: p.agent.contextDocsCount,
      github_token_configured: await this.deps.secrets.has('GITHUB_TOKEN'),
      leaks: scanFiles([...p.head, p.workflow]),
    };
  }

  // -------------------------------------------------------------------- check

  /** AC-23, AC-74, AC-68: validate the (possibly hand-edited) workflow text. */
  async check(workspaceId: string, agentId: string, input: CiCheckInput): Promise<CiCheckResult> {
    const p = await this.prepare(workspaceId, agentId, input, input.workflow);
    return {
      ...checkWorkflow(input.workflow),
      leaks: scanFiles([...p.head, p.workflow]),
    };
  }

  // ------------------------------------------------------------------ secrets

  /** AC-26: names only. A token without permission to list them yields `unknown`. */
  async secretsStatus(workspaceId: string, agentId: string, repo: string): Promise<CiSecretsStatus> {
    await this.requireAgent(workspaceId, agentId);
    await this.requireImportedRepo(workspaceId, repo);
    const tokenConfigured = await this.deps.secrets.has('GITHUB_TOKEN');
    if (!tokenConfigured) return { github_token_configured: false, openrouter_key: 'unknown' };
    try {
      const github = await this.deps.github();
      const names = await github.listActionsSecretNames(toRepoRef(repo));
      return {
        github_token_configured: true,
        openrouter_key: names.includes('OPENROUTER_API_KEY') ? 'set' : 'not_set',
      };
    } catch (err) {
      if (err instanceof GitHubPermissionError) {
        return { github_token_configured: true, openrouter_key: 'unknown' };
      }
      throw err;
    }
  }

  // ------------------------------------------------------------------ install

  /**
   * AC-30…AC-37, AC-68, AC-75, NFR-5: re-validates everything server side, then
   * opens/updates the PR or builds the zip, and only then records the installation.
   */
  async install(
    workspaceId: string,
    agentId: string,
    input: CiInstallInput,
    log?: CiLogger,
  ): Promise<CiInstallResult> {
    const p = await this.prepare(workspaceId, agentId, input, input.workflow);

    const leaks = scanFiles([...p.head, p.workflow]);
    if (leaks.length > 0) {
      throw new ValidationError(`Secret-like value found: ${describeLeaks(leaks)}`, { leaks });
    }
    const checked = checkWorkflow(input.workflow);
    if (checked.yaml_error) {
      const { message, line } = checked.yaml_error;
      throw new ValidationError(`Workflow is not valid YAML (line ${line}): ${message}`, {
        yaml_error: checked.yaml_error,
      });
    }
    if (hasRisks(checked) && !input.acknowledge_risk) {
      const risks = checked.risks.filter((r) => r.risk);
      throw new ValidationError(
        `Workflow contains risky constructs that need acknowledgement: ${risks.map((r) => r.detail).join('; ')}`,
        { risks },
      );
    }

    const bundle = await this.runnerFiles();
    const files = [
      ...p.head,
      ...bundle.map((b) => ({ path: `${CI_RUNNER_DIR}${b.path}`, contents: b.contents })),
      p.workflow,
    ].map(({ path, contents }) => ({ path, contents }));

    const base = {
      agentId: p.agent.id,
      repo: input.repo,
      agentSlug: p.agentSlug,
      agentName: p.agent.name,
      workflowPath: p.workflowPath,
      exportedAgentVersion: p.agent.version,
      triggers: input.triggers,
      postAs: input.post_as,
    };

    if (input.action === 'zip') {
      const zip = buildInstallZip(files);
      const installation = await this.deps.repo.upsertInstallation(workspaceId, {
        ...base,
        status: 'awaiting_manual',
        prUrl: null,
        prNumber: null,
        now: this.deps.now(),
      });
      return {
        installation: await this.toContract(workspaceId, installation),
        pr_url: null,
        files_count: files.length,
        zip_base64: Buffer.from(zip).toString('base64'),
      };
    }

    if (!(await this.deps.secrets.has('GITHUB_TOKEN'))) {
      throw new ValidationError('No GitHub token is configured. Add one in Settings → API Keys.');
    }
    const repoRef = toRepoRef(input.repo);
    let pr: { url: string; number: number };
    try {
      const github = await this.deps.github();
      const defaultBranch = await github.getDefaultBranch(repoRef);
      const existing = await github.findOpenPr(repoRef, CI_BRANCH);
      await github.commitFiles(repoRef, {
        branch: CI_BRANCH,
        base: defaultBranch,
        message: `Add DevDigest review agent "${p.agentSlug}"`,
        files,
        fromBase: !existing,
      });
      pr =
        existing ??
        (await github.openPullRequest(repoRef, {
          title: PR_TITLE,
          head: CI_BRANCH,
          base: defaultBranch,
          body: PR_BODY,
        }));
    } catch (err) {
      throw githubInstallError(err);
    }
    log?.info({ repo: input.repo, branch: CI_BRANCH, pr_url: pr.url }, 'ci install committed');

    const installation = await this.deps.repo.upsertInstallation(workspaceId, {
      ...base,
      status: 'pr_open',
      prUrl: pr.url,
      prNumber: pr.number,
      now: this.deps.now(),
    });
    return {
      installation: await this.toContract(workspaceId, installation),
      pr_url: pr.url,
      files_count: files.length,
      zip_base64: null,
    };
  }

  // ------------------------------------------------------------------ queries

  /** The workspace's installations (optionally one agent's) with the latest run of each. */
  async listInstallations(workspaceId: string, agentId?: string): Promise<CiInstallation[]> {
    if (agentId) await this.requireAgent(workspaceId, agentId);
    const records = agentId
      ? await this.deps.repo.listInstallationsForAgent(workspaceId, agentId)
      : await this.deps.repo.listInstallations(workspaceId);
    const latest = await this.deps.repo.latestRunByInstallation(
      workspaceId,
      records.map((r) => r.id),
    );
    return records.map((r) => toInstallation(r, latest.get(r.id) ?? null));
  }

  async listRuns(
    workspaceId: string,
    query: { limit?: number; cursor?: string; installationId?: string; agentId?: string },
  ): Promise<CiRunsPage> {
    let after;
    if (query.cursor) {
      after = decodeRunsCursor(query.cursor) ?? undefined;
      if (!after) throw new ValidationError('Invalid cursor');
    }
    const limit = Math.min(Math.max(query.limit ?? DEFAULT_RUNS_LIMIT, 1), MAX_RUNS_LIMIT);
    const slice = await this.deps.repo.listCiRuns(workspaceId, {
      limit,
      after,
      installationId: query.installationId,
      agentId: query.agentId,
    });
    return { items: slice.items, next_cursor: slice.next ? encodeRunsCursor(slice.next) : null };
  }

  async getRun(workspaceId: string, runId: string): Promise<CiRunDetail> {
    const run = await this.deps.repo.getCiRun(workspaceId, runId);
    if (!run) throw new NotFoundError('CI run not found');
    return run;
  }

  // ------------------------------------------------------------------ helpers

  private async requireAgent(workspaceId: string, agentId: string): Promise<CiAgent> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  private async requireImportedRepo(workspaceId: string, repo: string): Promise<void> {
    if (!parseRepoSlug(repo)) throw new ValidationError('Repository must be "owner/name"');
    if (!(await this.deps.repo.isImportedRepo(workspaceId, repo))) {
      throw new ValidationError('Repository is not imported in this workspace');
    }
  }

  /** Agent + repo checks, slug choice and the text files in Preview order. */
  private async prepare(
    workspaceId: string,
    agentId: string,
    input: CiPreviewInput,
    workflowOverride: string | undefined,
  ): Promise<Prepared> {
    const agent = await this.requireAgent(workspaceId, agentId);
    if (agent.provider !== 'openrouter') {
      throw new ValidationError(
        "CI runs use OpenRouter. Switch this agent's provider to OpenRouter in Config to export.",
      );
    }
    await this.requireImportedRepo(workspaceId, input.repo);

    // Slug is stable per (agent, repo) installation; a new one avoids slugs other agents use there (Q-2).
    const onRepo = await this.deps.repo.listInstallationsForRepo(workspaceId, input.repo);
    const own = onRepo.find((i) => i.agentId === agent.id);
    const agentSlug =
      own?.agentSlug ??
      slugify(agent.name, new Set(onRepo.map((i) => i.agentSlug)), AGENT_SLUG_FALLBACK);

    const skills = await this.deps.agents.linkedSkills(agent.id);
    const skillSlugs = uniqueSlugs(
      skills.map((s) => s.name),
      SKILL_SLUG_FALLBACK,
    );

    let manifest: string;
    try {
      manifest = buildManifestYaml(
        {
          name: agent.name,
          version: agent.version,
          provider: agent.provider,
          model: agent.model,
          system_prompt: agent.systemPrompt,
          strategy: agent.strategy,
          ci_fail_on: agent.ciFailOn,
        },
        skillSlugs,
      );
    } catch (err) {
      throw new ValidationError('The agent manifest could not be generated', {
        reason: (err as Error).message,
      });
    }

    const workflowPath = workflowPathFor(agentSlug);
    const workflow: TextFile = {
      path: workflowPath,
      editable: true,
      contents:
        workflowOverride ??
        generateWorkflow({ agentSlug, triggers: input.triggers, postAs: input.post_as }),
    };
    const head: TextFile[] = [
      { path: manifestPathFor(agentSlug), contents: manifest, editable: false },
      ...skills.map((s, i) => ({
        path: skillPathFor(skillSlugs[i]!),
        contents: s.body,
        editable: false,
      })),
      { path: CI_MEMORY_PATH, contents: '', editable: false },
    ];
    return { agent, agentSlug, workflowPath, head, workflow };
  }

  private async runnerEntries() {
    try {
      return await this.deps.bundle.list();
    } catch (err) {
      throw bundleError(err);
    }
  }

  private async runnerFiles() {
    try {
      return await this.deps.bundle.read();
    } catch (err) {
      throw bundleError(err);
    }
  }

  private async toContract(workspaceId: string, r: CiInstallationRecord): Promise<CiInstallation> {
    const latest = await this.deps.repo.latestRunByInstallation(workspaceId, [r.id]);
    return toInstallation(r, latest.get(r.id) ?? null);
  }
}

const PR_BODY =
  'Adds a DevDigest review agent to this repository: the agent manifest, its skills, ' +
  'the bundled runner and a GitHub Actions workflow that reviews pull requests.\n\n' +
  'Before merging, add `OPENROUTER_API_KEY` to the repository Actions secrets.';

function toRepoRef(repo: string): { owner: string; name: string } {
  const parsed = parseRepoSlug(repo);
  if (!parsed) throw new ValidationError('Repository must be "owner/name"');
  return parsed;
}

function describeLeaks(leaks: readonly CiSecretLeak[]): string {
  return leaks.map((l) => `${l.path}:${l.line}`).join(', ');
}

function toInstallation(
  r: CiInstallationRecord,
  latestRun: CiInstallation['latest_run'],
): CiInstallation {
  return {
    id: r.id,
    agent_id: r.agentId,
    repo: r.repo,
    target_type: r.targetType,
    agent_slug: r.agentSlug,
    workflow_path: r.workflowPath,
    status: r.status,
    status_changed_at: r.statusChangedAt.toISOString(),
    exported_agent_version: r.exportedAgentVersion,
    triggers: r.triggers,
    post_as: r.postAs,
    pr_url: r.prUrl,
    latest_run: latestRun,
  };
}

/** GitHub's own message plus the token permissions the install needs (AC-34). Never headers or tokens. */
function githubInstallError(err: unknown): AppError {
  if (err instanceof AppError && !(err instanceof ExternalServiceError)) return err;
  const details =
    err instanceof ExternalServiceError && err.details && typeof err.details === 'object'
      ? (err.details as Record<string, unknown>)
      : {};
  const message = err instanceof ExternalServiceError ? err.message : 'GitHub request failed';
  return new ExternalServiceError(message, {
    ...details,
    needed_permissions: CI_REQUIRED_TOKEN_PERMISSIONS,
  });
}

function bundleError(err: unknown): unknown {
  return err instanceof RunnerBundleMissingError ? new ConfigError(err.message) : err;
}
