import { appendFileSync } from 'node:fs';
import type { CiResultArtifact } from '@devdigest/shared';

/**
 * GitHub Actions job summary — a short Markdown table of the run, appended to
 * the file named by `GITHUB_STEP_SUMMARY` so the result is visible on the
 * workflow run page without opening the PR or downloading the artifact.
 *
 * Built only from the already-validated `CiResultArtifact` (typed counts, the
 * deterministic verdict, trace metadata). Free text from the model — finding
 * titles, rationales — never reaches the summary, so it cannot inject Markdown
 * or links into the run page (NFR-1: no secret, no untrusted text).
 */

const VERDICT_LABEL: Record<NonNullable<CiResultArtifact['verdict']>, string> = {
  approve: 'Approve',
  comment: 'Comment',
  request_changes: 'Request changes',
};

/** Escape the characters that would break out of a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/[|\\`*_<>\[\]\r\n]/g, (ch) => (/[\r\n]/.test(ch) ? ' ' : `\\${ch}`));
}

/** Older runners omit most counters; show a dash instead of `undefined`. */
function count(value: number | null | undefined): string {
  return value == null ? '—' : String(value);
}

function formatDuration(ms: number | null | undefined): string {
  if (ms == null) return '—';
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)} s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} min ${Math.round(seconds - minutes * 60)} s`;
}

function formatCost(costUsd: number | null): string {
  return costUsd === null ? '—' : `$${costUsd.toFixed(4)}`;
}

/** Render the summary for one agent run. Pure: no I/O, no clock, no env. */
export function renderJobSummary(artifact: CiResultArtifact): string {
  const rows: [string, string][] = [
    ['Verdict', artifact.verdict ? VERDICT_LABEL[artifact.verdict] : '—'],
    ['Blockers', count(artifact.blockers)],
    ['Findings', count(artifact.findings_count)],
    ['Critical', count(artifact.critical)],
    ['Warning', count(artifact.warning)],
    ['Suggestion', count(artifact.suggestion)],
    ['Model', artifact.trace?.model ?? '—'],
    ['Cost', formatCost(artifact.cost_usd)],
    ['Duration', formatDuration(artifact.duration_ms)],
    ['Head commit', artifact.trace?.head_sha.slice(0, 7) ?? '—'],
  ];

  const lines = [
    `### DevDigest review — ${cell(artifact.agent)}${artifact.pr_number == null ? '' : ` on PR #${artifact.pr_number}`}`,
    '',
    '| | |',
    '| --- | --- |',
    ...rows.map(([label, value]) => `| ${label} | ${cell(value)} |`),
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export interface WriteJobSummaryDeps {
  /** Path from `GITHUB_STEP_SUMMARY`; unset outside GitHub Actions. */
  summaryPath: string | undefined;
  append?: typeof appendFileSync;
}

/**
 * Append the summary to the job summary file. Best-effort: a summary is a
 * convenience, so a missing path or a write failure returns `false` and must
 * never change the runner's exit code (that comes from the gate alone).
 */
export function writeJobSummary(artifact: CiResultArtifact, deps: WriteJobSummaryDeps): boolean {
  if (!deps.summaryPath) return false;
  const append = deps.append ?? appendFileSync;
  try {
    append(deps.summaryPath, renderJobSummary(artifact));
    return true;
  } catch (err) {
    console.warn(`[agent-runner] could not write the job summary: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}
