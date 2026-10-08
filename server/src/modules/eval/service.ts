import type {
  EvalCaseCreateInput,
  EvalCaseDetail,
  EvalCaseFromFindingResponse,
  EvalCaseSummary,
  EvalCaseUpdateInput,
  EvalCompare,
  EvalDashboardOverview,
  EvalExpectation,
  EvalRunAllResponse,
  EvalRunDetail,
  EvalCaseRunDetail,
  EvalStartRunResponse,
  EvalSuiteRun,
  EvalSuiteRunStatus,
} from '@devdigest/shared';
import { AppError, NotFoundError, ValidationError } from '../../platform/errors.js';
import { EVAL_RECENT_RUNS, EVAL_SPARK_POINTS } from './constants.js';
import { compareRuns, diffConfigs } from './compare.js';
import { expectationTypeFor, filesOf, patchForFile, slugify, uniqueName, validateExpectationsAgainstDiff } from './helpers.js';
import { EvalRunExecutor } from './run-executor.js';
import type { ConfigSnapshot, EvalAgent, EvalRunConfig, EvalServiceDeps, FindingDecision } from './types.js';

const DAY_MS = 86_400_000;

const agentDeleted = () =>
  new AppError('agent_deleted', 'The agent that produced this finding was deleted', 409);

/** Filters of the run history (AC-28, AC-55, Q-6). */
export interface RunHistoryQuery {
  days?: number;
  status?: EvalSuiteRunStatus;
  limit?: number;
}

/**
 * SPEC-06 eval use cases: cases (from a finding or by hand), runs, queries, compare.
 * Talks to the world through explicit ports (`EvalServiceDeps`) — never the Container.
 */
export class EvalService {
  private readonly executor: EvalRunExecutor;

  constructor(private deps: EvalServiceDeps) {
    this.executor = new EvalRunExecutor(deps);
  }

  // ------------------------------------------------------------------ cases

  /** AC-1, AC-2, AC-7, AC-8, AC-9, AC-13, AC-65, AC-66. */
  async createFromFinding(workspaceId: string, findingId: string): Promise<EvalCaseFromFindingResponse> {
    const { repo, agents, findings, prDiff, parseDiff } = this.deps;
    const facts = await findings.facts(findingId);
    if (!facts || facts.workspaceId !== workspaceId) throw new NotFoundError('Finding not found');

    // AC-9: a finding is at most one case; a later decision change is carried over by syncCaseWithDecision.
    const existing = await repo.getCaseBySourceFinding(workspaceId, findingId);
    if (existing) return { case: existing, created: false };

    if (!facts.accepted && !facts.dismissed) {
      throw new ValidationError('The finding must be accepted or dismissed first');
    }
    const agent = facts.agentId ? await agents.getById(workspaceId, facts.agentId) : undefined;
    if (!agent) throw agentDeleted();

    // AC-13: the whole patch of the finding's file, no size check (EC-14/NG-7).
    const pr = await prDiff.forPull(workspaceId, facts.prId);
    const patch = pr ? patchForFile(pr.diffRaw, facts.file) : null;
    if (!pr || patch === null) {
      throw new AppError(
        'diff_unavailable',
        `The diff of '${facts.file}' is not available, so no eval case can be made from this finding`,
        422,
      );
    }

    const taken = await repo.caseNamesForAgent(workspaceId, agent.id);
    const result = await repo.insertCase(workspaceId, {
      agentId: agent.id,
      name: uniqueName(slugify(facts.title), taken),
      inputDiff: patch,
      inputMeta: { title: pr.title, body: pr.body ?? '' },
      inputFiles: filesOf(parseDiff(patch)),
      expectedOutput: [
        {
          type: expectationTypeFor(facts.accepted ? 'accepted' : 'dismissed'),
          file: facts.file,
          start_line: facts.startLine,
          end_line: facts.endLine,
          title: facts.title,
          severity: facts.severity,
          category: facts.category,
        },
      ],
      sourceFindingId: findingId,
    });
    return result;
  }

  /**
   * The decision on a finding changed: the case made from it (if any) follows. Changes only the type
   * of the first expectation; true when a case was updated (D1/D2).
   */
  async syncCaseWithDecision(workspaceId: string, findingId: string, decision: FindingDecision): Promise<boolean> {
    return this.deps.repo.setFirstExpectationType(workspaceId, findingId, expectationTypeFor(decision));
  }

  async listCases(workspaceId: string, agentId: string): Promise<EvalCaseSummary[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.deps.repo.listCases(workspaceId, agentId);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseDetail> {
    const c = await this.deps.repo.getCase(workspaceId, caseId);
    if (!c) throw new NotFoundError('Eval case not found');
    return c;
  }

  /** AC-71, AC-75 (manual create only checks expectations against the supplied diff). */
  async createCase(workspaceId: string, agentId: string, input: EvalCaseCreateInput): Promise<EvalCaseDetail> {
    await this.requireAgent(workspaceId, agentId);
    const diff = this.deps.parseDiff(input.input_diff);
    if (diff.files.length === 0) throw new ValidationError('The case diff contains no files');
    this.assertExpectationsFit(diff, input.expected_output);
    const { case: created } = await this.deps.repo.insertCase(workspaceId, {
      agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputMeta: input.input_meta,
      inputFiles: filesOf(diff),
      expectedOutput: input.expected_output,
    });
    return created;
  }

  /** AC-72: only name + expected output change (the schema is strict); AC-75 on the new expectations. */
  async updateCase(workspaceId: string, caseId: string, patch: EvalCaseUpdateInput): Promise<EvalCaseDetail> {
    const current = await this.getCase(workspaceId, caseId);
    if (patch.expected_output) {
      this.assertExpectationsFit(this.deps.parseDiff(current.input_diff), patch.expected_output);
    }
    const updated = await this.deps.repo.updateCase(workspaceId, caseId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
    });
    if (!updated) throw new NotFoundError('Eval case not found');
    return updated;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<{ ok: true }> {
    const ok = await this.deps.repo.deleteCase(workspaceId, caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  }

  /**
   * AC-51/AC-53: run the agent's CURRENT configuration on one case. Writes a result row with no
   * suite run, so only the case's latest outcome changes — no history, metrics or dashboard.
   */
  async runCase(workspaceId: string, caseId: string): Promise<EvalCaseDetail> {
    const c = await this.getCase(workspaceId, caseId);
    const agent = await this.requireAgent(workspaceId, c.agent_id);
    await this.assertKey(agent);
    const cfg = await this.configOf(agent);
    const llm = await this.deps.llm(agent.provider);
    const draft = await this.executor.reviewCase(cfg, llm, c, `eval:${agent.id}:case:${c.id}`);
    if (draft.status === 'error') {
      // Nothing is stored: an errored run is not a scored outcome.
      throw new AppError('eval_case_failed', draft.error ?? 'The agent call failed', 502);
    }
    await this.deps.repo.insertCaseRun({ ...draft, suiteRunId: null });
    return this.getCase(workspaceId, caseId);
  }

  // ------------------------------------------------------------------- runs

  /** AC-15..AC-19: validate, record the run, answer with its id, execute in the background. */
  async startRun(workspaceId: string, agentId: string): Promise<EvalStartRunResponse> {
    const { repo, agents, now } = this.deps;
    const first = await this.requireAgent(workspaceId, agentId);
    const cases = await repo.listCaseDetails(workspaceId, agentId);
    if (cases.length === 0) {
      throw new AppError('empty_set', 'This agent has no eval cases yet, so the set is empty', 422);
    }
    await this.assertKey(first);

    // Seeded agents have no snapshot until edited: make sure the version we run is on record.
    await agents.ensureVersionSnapshot(workspaceId, agentId);
    // The configuration is read ONCE here; later edits do not change this run (EC-13).
    const agent = (await agents.getById(workspaceId, agentId)) ?? first;
    const cfg = await this.configOf(agent);

    const created = await repo.createSuiteRun(workspaceId, {
      agentId,
      agentVersion: agent.version,
      casesTotal: cases.length,
    });
    if (created.kind === 'already_running') {
      throw new AppError('already_running', 'An eval run of this agent is already in progress', 409);
    }
    const run = created.run;
    void this.executor.executeSuite(run.id, cfg, cases, now()).catch(() => undefined);
    return { run_id: run.id };
  }

  /** AC-44: one run per enabled agent that has cases and no run in progress; the others are skipped. */
  async startAll(workspaceId: string): Promise<EvalRunAllResponse> {
    const started: EvalRunAllResponse['started'] = [];
    for (const agent of await this.deps.agents.listEnabled(workspaceId)) {
      try {
        const { run_id } = await this.startRun(workspaceId, agent.id);
        started.push({ agent_id: agent.id, run_id });
      } catch {
        /* empty set, run in progress, missing key: not started */
      }
    }
    return { started };
  }

  /** AC-74: runs left `running` by a previous process are failed on boot. */
  async failStaleRuns(): Promise<number> {
    return this.deps.repo.failStaleRunning('The API restarted while this run was in progress', this.deps.now());
  }

  // ---------------------------------------------------------------- queries

  /** AC-28, AC-55, Q-6: any status unless `status` is given, newest first. */
  async history(workspaceId: string, agentId: string, q: RunHistoryQuery = {}): Promise<EvalSuiteRun[]> {
    await this.requireAgent(workspaceId, agentId);
    return this.deps.repo.listSuiteRuns(workspaceId, {
      agentId,
      ...(q.status ? { status: q.status } : {}),
      ...(q.days ? { since: new Date(this.deps.now().getTime() - q.days * DAY_MS) } : {}),
      ...(q.limit ? { limit: q.limit } : {}),
    });
  }

  async runDetail(workspaceId: string, runId: string): Promise<EvalRunDetail> {
    const run = await this.deps.repo.getSuiteRun(workspaceId, runId);
    if (!run) throw new NotFoundError('Eval run not found');
    return { run, cases: await this.deps.repo.listCaseRuns(workspaceId, runId) };
  }

  async caseRunDetail(workspaceId: string, runId: string, rowId: string): Promise<EvalCaseRunDetail> {
    const detail = await this.deps.repo.getCaseRunDetail(workspaceId, runId, rowId);
    if (!detail) throw new NotFoundError('Eval case result not found');
    return detail;
  }

  dashboard(workspaceId: string): Promise<EvalDashboardOverview> {
    return this.deps.repo.dashboardOverview(workspaceId, {
      sparkPoints: EVAL_SPARK_POINTS,
      recentLimit: EVAL_RECENT_RUNS,
    });
  }

  /** AC-31..33, AC-41, AC-45, AC-76: two completed runs of one agent, ordered by start time. */
  async compare(workspaceId: string, runA: string, runB: string): Promise<EvalCompare> {
    const { repo, agents } = this.deps;
    if (runA === runB) throw new ValidationError('Pick two different runs to compare');
    const [a, b] = await Promise.all([repo.getSuiteRun(workspaceId, runA), repo.getSuiteRun(workspaceId, runB)]);
    if (!a || !b) throw new NotFoundError('Eval run not found');
    if (a.agent_id !== b.agent_id) throw new ValidationError('Only runs of the same agent can be compared');
    if (a.status !== 'done' || b.status !== 'done') {
      throw new ValidationError('Only completed runs can be compared');
    }
    const [older, newer] =
      a.started_at < b.started_at || (a.started_at === b.started_at && a.id < b.id) ? [a, b] : [b, a];

    const [olderCfg, newerCfg, olderRows, newerRows] = await Promise.all([
      agents.versionConfig(older.agent_id, older.agent_version),
      agents.versionConfig(newer.agent_id, newer.agent_version),
      repo.listCompareRows(workspaceId, older.id),
      repo.listCompareRows(workspaceId, newer.id),
    ]);
    if (!olderCfg || !newerCfg) throw new NotFoundError('Agent version snapshot not found');

    const skillIds = [...new Set([...olderCfg.skills, ...newerCfg.skills])];
    const names = new Map<string, string>();
    await Promise.all(
      skillIds.map(async (id) => {
        const name = await agents.skillName(workspaceId, id);
        if (name) names.set(id, name);
      }),
    );
    return compareRuns(
      { run: older, cases: olderRows },
      { run: newer, cases: newerRows },
      diffConfigs(olderCfg as ConfigSnapshot, newerCfg as ConfigSnapshot, names),
    );
  }

  // ---------------------------------------------------------------- helpers

  private async requireAgent(workspaceId: string, agentId: string): Promise<EvalAgent> {
    const agent = await this.deps.agents.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    return agent;
  }

  /** AC-18: reject before any model call when the provider key is not configured. */
  private async assertKey(agent: EvalAgent): Promise<void> {
    const missing = await this.deps.missingKey(agent.provider);
    if (missing) {
      throw new AppError('missing_key', `The ${missing} key is not configured for provider '${agent.provider}'`, 422);
    }
  }

  /** The configuration an eval executes with: provider, model, prompt, strategy, enabled skills in link order. */
  private async configOf(agent: EvalAgent): Promise<EvalRunConfig> {
    const skills = await this.deps.agents.enabledSkills(agent.id);
    return {
      agentId: agent.id,
      provider: agent.provider,
      model: agent.model,
      systemPrompt: agent.systemPrompt,
      strategy: agent.strategy,
      skills: skills.map((s) => this.deps.skillBlock(s)),
    };
  }

  private assertExpectationsFit(diff: ReturnType<EvalServiceDeps['parseDiff']>, expectations: EvalExpectation[]) {
    const reasons = validateExpectationsAgainstDiff(diff, expectations);
    if (reasons.length > 0) throw new ValidationError(reasons.join('; '), { reasons });
  }
}
