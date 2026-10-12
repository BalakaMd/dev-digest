import type { Finding, Verdict } from '@devdigest/shared';
import { CiResultArtifact, CI_ARTIFACT_MAX_BYTES } from '@devdigest/shared';
import { RunnerError } from './errors.js';
import { REVIEWER_CORE_REVISION } from './build-info.js';

/** Runner bundle version embedded in every artifact (AC-51). */
export const RUNNER_VERSION = '2';

export interface ArtifactTraceInput {
  manifestVersion: number;
  manifestSha256: string;
  model: string;
  skillHashes: { slug: string; sha256: string }[];
  headSha: string;
}

export interface BuildResultArtifactInput {
  findings: Finding[];
  costUsd: number | null;
  durationMs: number;
  agent: string;
  prNumber: number;
  /** Deterministic verdict (from the gate, never the model's self-report). */
  verdict: Verdict;
  blockers: number;
  trace: ArtifactTraceInput;
}

/** Map the GitHub review event the deterministic gate produced to a `Verdict`. */
export function verdictFromEvent(event: 'APPROVE' | 'COMMENT' | 'REQUEST_CHANGES'): Verdict {
  if (event === 'APPROVE') return 'approve';
  if (event === 'REQUEST_CHANGES') return 'request_changes';
  return 'comment';
}

function severityCounts(findings: Finding[]): { critical: number; warning: number; suggestion: number } {
  const counts = { critical: 0, warning: 0, suggestion: 0 };
  for (const f of findings) {
    if (f.severity === 'CRITICAL') counts.critical++;
    else if (f.severity === 'WARNING') counts.warning++;
    else counts.suggestion++;
  }
  return counts;
}

/**
 * Build + validate the `devdigest-result.json` artifact. Validated against the
 * SAME `CiResultArtifact` contract the studio's ingest `safeParse`s on the way
 * back in. Built only from typed fields — no env, token or key can reach it
 * (AC-63, NFR-1).
 */
export function buildResultArtifact(input: BuildResultArtifactInput): CiResultArtifact {
  const counts = severityCounts(input.findings);
  const candidate = {
    findings_count: input.findings.length,
    critical: counts.critical,
    warning: counts.warning,
    suggestion: counts.suggestion,
    cost_usd: input.costUsd,
    duration_ms: Math.round(input.durationMs),
    agent: input.agent,
    version: RUNNER_VERSION,
    pr_number: input.prNumber,
    verdict: input.verdict,
    blockers: input.blockers,
    trace: {
      manifest: { agent_version: input.trace.manifestVersion, sha256: input.trace.manifestSha256 },
      model: input.trace.model,
      runner_version: RUNNER_VERSION,
      reviewer_core_revision: REVIEWER_CORE_REVISION,
      node_version: process.version,
      skill_hashes: input.trace.skillHashes,
      head_sha: input.trace.headSha,
    },
  };
  const result = CiResultArtifact.safeParse(candidate);
  if (!result.success) {
    // Unreachable unless the schema and this builder drift — an internal bug.
    throw new RunnerError(
      `Internal error: built result artifact failed CiResultArtifact validation: ${result.error.message}`,
    );
  }
  return result.data;
}

/** Serialize the artifact; refuse to exceed `CI_ARTIFACT_MAX_BYTES` (I3). */
export function serializeArtifact(artifact: CiResultArtifact): string {
  const text = `${JSON.stringify(artifact, null, 2)}\n`;
  const bytes = Buffer.byteLength(text, 'utf8');
  if (bytes > CI_ARTIFACT_MAX_BYTES) {
    throw new RunnerError(
      `Result artifact is ${bytes} bytes, over the ${CI_ARTIFACT_MAX_BYTES}-byte limit; refusing to write it`,
    );
  }
  return text;
}
