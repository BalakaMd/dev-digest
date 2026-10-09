import PQueue from 'p-queue';
import { reviewPullRequest } from '@devdigest/reviewer-core';
import type { EvalCaseDetail, LLMProvider } from '@devdigest/shared';
import { EVAL_CONCURRENCY, EVAL_TASK_LINE } from './constants.js';
import { scoreCase, scoreRun } from './scoring.js';
import type { EvalRepository, InsertCaseRunInput } from './repository.js';
import type { CaseCounters, EvalRunConfig, EvalServiceDeps } from './types.js';

/** Longest error message stored for an errored case. */
const MAX_ERROR_CHARS = 500;

/** A case result without its run linkage. */
export type CaseDraft = Omit<InsertCaseRunInput, 'suiteRunId'>;

type ExecutorDeps = Pick<EvalServiceDeps, 'repo' | 'parseDiff' | 'llm' | 'now'>;

/** "Title: ...\n\n<body>" — the only PR text the model sees, wrapped as untrusted by the engine (NFR-2). */
function prDescriptionOf(meta: { title: string; body: string }): string | undefined {
  const parts: string[] = [];
  if (meta.title.trim()) parts.push(`Title: ${meta.title}`);
  if (meta.body.trim()) parts.push(meta.body);
  return parts.length > 0 ? parts.join('\n\n') : undefined;
}

const isForeignKeyViolation = (err: unknown): boolean => {
  const e = err as { code?: string; cause?: { code?: string } };
  return e?.code === '23503' || e?.cause?.code === '23503';
};

const messageOf = (err: unknown): string =>
  (err instanceof Error ? err.message : String(err)).slice(0, MAX_ERROR_CHARS);

/**
 * Runs eval cases. A case is reviewed with `reviewPullRequest` directly and ONLY from
 * its stored input and the agent configuration frozen at run start (AC-14): no intent,
 * repo-intel, callers, specs or memory. Scoring is code-only (AC-26).
 */
export class EvalRunExecutor {
  private readonly repo: EvalRepository;

  constructor(private deps: ExecutorDeps) {
    this.repo = deps.repo;
  }

  /** Review one case and score it. Never throws: a failed model call becomes an `error` draft (AC-20). */
  async reviewCase(
    cfg: EvalRunConfig,
    llm: LLMProvider,
    c: EvalCaseDetail,
    sessionId: string,
  ): Promise<CaseDraft> {
    const started = this.deps.now().getTime();
    const base = { caseId: c.id, caseName: c.name, expectations: c.expected_output };
    try {
      const diff = this.deps.parseDiff(c.input_diff);
      const prDescription = prDescriptionOf(c.input_meta);
      const outcome = await reviewPullRequest({
        systemPrompt: cfg.systemPrompt,
        model: cfg.model,
        diff,
        llm,
        strategy: cfg.strategy,
        ...(cfg.skills.length > 0 ? { skills: cfg.skills } : {}),
        ...(prDescription ? { prDescription } : {}),
        task: EVAL_TASK_LINE,
        sessionId,
      });
      const kept = outcome.review.findings;
      const dropped = outcome.dropped;
      const score = scoreCase({
        expectations: c.expected_output,
        kept,
        dropped: dropped.map((d) => d.finding),
      });
      return {
        ...base,
        status: 'ok',
        error: null,
        actual: {
          findings: kept.map((f, i) => ({
            file: f.file,
            start_line: f.start_line,
            end_line: f.end_line,
            title: f.title,
            severity: f.severity,
            category: f.category,
            rationale: f.rationale,
            matched: score.finding_matched[i] ?? false,
          })),
          dropped: dropped.map((d) => ({
            file: d.finding.file,
            start_line: d.finding.start_line,
            end_line: d.finding.end_line,
            title: d.finding.title,
            reason: d.reason,
          })),
          expectation_matches: score.expectation_matches,
        },
        passed: score.passed,
        findingsReturned: score.findings_returned,
        findingsKept: score.findings_kept,
        mustFindTotal: score.must_find_total,
        mustFindMatched: score.must_find_matched,
        mustNotFlagHits: score.must_not_flag_hits,
        durationMs: this.deps.now().getTime() - started,
        costUsd: outcome.costUsd,
      };
    } catch (err) {
      return {
        ...base,
        status: 'error',
        error: messageOf(err),
        actual: null,
        passed: null,
        findingsReturned: 0,
        findingsKept: 0,
        mustFindTotal: 0,
        mustFindMatched: 0,
        mustNotFlagHits: 0,
        durationMs: this.deps.now().getTime() - started,
        costUsd: null,
      };
    }
  }

  /**
   * Execute every case of a started suite run in the background (AC-16). Each case writes
   * its row and bumps the run's progress; an errored case is excluded from the metrics and
   * the run continues (AC-20). Any unexpected failure closes the run as `failed`.
   * Never rejects.
   */
  async executeSuite(
    runId: string,
    cfg: EvalRunConfig,
    cases: EvalCaseDetail[],
    startedAt: Date,
  ): Promise<void> {
    const queue = new PQueue({ concurrency: EVAL_CONCURRENCY });
    try {
      const llm = await this.deps.llm(cfg.provider);
      const counters: CaseCounters[] = [];
      await Promise.all(
        cases.map((c) =>
          queue.add(async () => {
            const draft = await this.reviewCase(cfg, llm, c, `eval:${cfg.agentId}:${runId}`);
            await this.repo.insertCaseRun({ ...draft, suiteRunId: runId }).catch((err: unknown) => {
              // The case was deleted while the run was in progress: its result has no
              // row to hang on (FK violation) — skip it, the run goes on.
              if (!isForeignKeyViolation(err)) throw err;
            });
            counters.push({
              status: draft.status,
              passed: draft.passed,
              findings_returned: draft.findingsReturned,
              findings_kept: draft.findingsKept,
              must_find_total: draft.mustFindTotal,
              must_find_matched: draft.mustFindMatched,
              must_not_flag_hits: draft.mustNotFlagHits,
              cost_usd: draft.costUsd,
            });
            await this.repo.bumpProgress(runId, {
              errored: draft.status === 'error',
              passed: draft.passed === true,
            });
          }),
        ),
      );
      const finishedAt = this.deps.now();
      await this.repo.finishSuiteRun(
        runId,
        scoreRun(counters),
        finishedAt,
        finishedAt.getTime() - startedAt.getTime(),
      );
    } catch (err) {
      queue.clear();
      const finishedAt = this.deps.now();
      await this.repo
        .failSuiteRun(runId, messageOf(err), finishedAt, finishedAt.getTime() - startedAt.getTime())
        .catch(() => undefined);
    }
  }
}
