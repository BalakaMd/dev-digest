import { describe, it, expect } from 'vitest';
import { CiResultArtifact, CI_ARTIFACT_MAX_BYTES } from '@devdigest/shared';
import type { Finding } from '@devdigest/shared';
import {
  buildResultArtifact,
  serializeArtifact,
  verdictFromEvent,
  RUNNER_VERSION,
  type BuildResultArtifactInput,
} from './artifact.js';
import { REVIEWER_CORE_REVISION } from './build-info.js';
import { RunnerError } from './errors.js';

function finding(id: string, severity: Finding['severity']): Finding {
  return {
    id,
    severity,
    category: 'bug',
    title: `finding ${id}`,
    file: 'src/a.ts',
    start_line: 1,
    end_line: 1,
    rationale: 'because',
    confidence: 0.9,
    kind: 'finding',
  };
}

function input(overrides: Partial<BuildResultArtifactInput> = {}): BuildResultArtifactInput {
  return {
    findings: [finding('1', 'CRITICAL'), finding('2', 'WARNING'), finding('3', 'SUGGESTION')],
    costUsd: 0.0123,
    durationMs: 1234.6,
    agent: 'Security Reviewer',
    prNumber: 7,
    verdict: 'request_changes',
    blockers: 1,
    trace: {
      manifestVersion: 4,
      manifestSha256: 'a'.repeat(64),
      model: 'deepseek/deepseek-v4-flash',
      skillHashes: [
        { slug: 'second', sha256: 'b'.repeat(64) },
        { slug: 'first', sha256: 'c'.repeat(64) },
      ],
      headSha: 'd'.repeat(40),
    },
    ...overrides,
  };
}

describe('buildResultArtifact (AC-51, AC-63)', () => {
  it('carries verdict, blockers and the full reproducibility trace, and parses against the shared contract', () => {
    const artifact = buildResultArtifact(input());

    expect(CiResultArtifact.safeParse(artifact).success).toBe(true);
    expect(artifact).toMatchObject({
      findings_count: 3,
      critical: 1,
      warning: 1,
      suggestion: 1,
      duration_ms: 1235,
      agent: 'Security Reviewer',
      pr_number: 7,
      verdict: 'request_changes',
      blockers: 1,
    });
    expect(artifact.trace).toEqual({
      manifest: { agent_version: 4, sha256: 'a'.repeat(64) },
      model: 'deepseek/deepseek-v4-flash',
      runner_version: RUNNER_VERSION,
      reviewer_core_revision: REVIEWER_CORE_REVISION,
      node_version: process.version,
      skill_hashes: [
        { slug: 'second', sha256: 'b'.repeat(64) },
        { slug: 'first', sha256: 'c'.repeat(64) },
      ],
      head_sha: 'd'.repeat(40),
    });
    expect(REVIEWER_CORE_REVISION).not.toBe('');
  });

  it('refuses to build an artifact the shared contract would reject (internal error, not a silent bad file)', () => {
    expect(() => buildResultArtifact(input({ blockers: 1.5 }))).toThrow(RunnerError);
  });
});

describe('verdictFromEvent (AC-48)', () => {
  it.each([
    ['APPROVE', 'approve'],
    ['COMMENT', 'comment'],
    ['REQUEST_CHANGES', 'request_changes'],
  ] as const)('maps the deterministic %s event to %s', (event, verdict) => {
    expect(verdictFromEvent(event)).toBe(verdict);
  });
});

describe('serializeArtifact (size limit)', () => {
  it('serializes a normal artifact as parseable JSON', () => {
    const artifact = buildResultArtifact(input());
    expect(JSON.parse(serializeArtifact(artifact))).toEqual(artifact);
  });

  it('refuses an artifact over CI_ARTIFACT_MAX_BYTES instead of returning it', () => {
    const artifact = buildResultArtifact(input({ agent: 'x'.repeat(CI_ARTIFACT_MAX_BYTES) }));
    expect(() => serializeArtifact(artifact)).toThrow(RunnerError);
    expect(() => serializeArtifact(artifact)).toThrow(/over the 1048576-byte limit/);
  });
});
