import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { CI_RUNNER_ENV, ciArtifactName } from '@devdigest/shared';
import { generateWorkflow } from '../../src/modules/ci/workflow.js';
import { workflowPathFor } from '../../src/modules/ci/helpers.js';
import { checkWorkflow } from '../../src/modules/ci/workflow-check.js';
import { scanForSecrets } from '../../src/modules/ci/secret-scan.js';

/**
 * T-9 — generated workflow, asserted on the PARSED YAML rather than on text
 * (AC-17…AC-22, AC-73, AC-76, NFR-1).
 */
type Step = { uses?: string; if?: string; run?: string; env?: Record<string, string>; with?: Record<string, unknown> };
type Wf = {
  on: { pull_request: { types: string[] } } & Record<string, unknown>;
  permissions: Record<string, string>;
  jobs: Record<string, { if?: string; steps: Step[]; permissions?: unknown }>;
};

const gen = (over: Partial<Parameters<typeof generateWorkflow>[0]> = {}) => {
  const text = generateWorkflow({
    agentSlug: 'security-reviewer',
    triggers: ['opened', 'synchronize'],
    postAs: 'github_review',
    ...over,
  });
  return { text, wf: parse(text) as Wf };
};
const reviewJob = (wf: Wf) => Object.values(wf.jobs)[0]!;

describe('generateWorkflow', () => {
  it('triggers only on pull_request with the selected activity types (AC-17)', () => {
    const { wf, text } = gen({ triggers: ['opened', 'reopened'] });
    expect(Object.keys(wf.on)).toEqual(['pull_request']);
    expect(wf.on.pull_request.types).toEqual(['opened', 'reopened']);
    for (const banned of ['pull_request_target', 'issue_comment', 'pull_request_review_comment', 'workflow_run']) {
      expect(text).not.toContain(banned);
    }
  });

  it('declares exactly contents: read and pull-requests: write, nothing else (AC-18)', () => {
    const { wf } = gen();
    expect(wf.permissions).toEqual({ contents: 'read', 'pull-requests': 'write' });
    expect(reviewJob(wf).permissions).toBeUndefined();
  });

  it('references the two secrets only as ${{ secrets.* }} expressions (AC-19, NFR-1)', () => {
    const { text } = gen();
    const refs = [...text.matchAll(/\$\{\{\s*secrets\.([A-Z_]+)\s*\}\}/g)].map((m) => m[1]);
    expect(new Set(refs)).toEqual(new Set(['OPENROUTER_API_KEY', 'GITHUB_TOKEN']));
    expect(text.match(/secrets\./g)).toHaveLength(2);
    expect(scanForSecrets('wf.yml', text)).toEqual([]);
  });

  it('runs the bundled runner for this agent and never the review-action (AC-20, AC-21)', () => {
    const { wf, text } = gen({ postAs: 'pr_comment' });
    const run = reviewJob(wf).steps.find((s) => s.run);
    expect(run?.run).toBe('node .devdigest/runner/index.js');
    expect(run?.env?.[CI_RUNNER_ENV.POST_AS]).toBe('pr_comment');
    expect(run?.env?.[CI_RUNNER_ENV.AGENT_SLUG]).toBe('security-reviewer');
    expect(text).not.toContain('review-action');
    expect(reviewJob(gen({ postAs: 'none' }).wf).steps.find((s) => s.run)?.env?.[CI_RUNNER_ENV.POST_AS]).toBe('none');
  });

  it('uploads the result with if: always(), named for the agent and the run attempt (AC-73)', () => {
    const { wf } = gen();
    const upload = reviewJob(wf).steps.find((s) => s.uses?.startsWith('actions/upload-artifact'));
    expect(upload?.if).toBe('always()');
    expect(upload?.with?.name).toBe(ciArtifactName('security-reviewer', '${{ github.run_attempt }}'));
    expect(upload?.with?.name).toBe('devdigest-result-security-reviewer-${{ github.run_attempt }}');
    expect(upload?.with?.['if-no-files-found']).toBe('ignore');
  });

  it('skips the job for pull requests from forks (AC-22)', () => {
    const { wf } = gen();
    expect(reviewJob(wf).if).toBe('github.event.pull_request.head.repo.full_name == github.repository');
  });

  it('puts each agent in its own workflow file so a second agent keeps the first (AC-76)', () => {
    expect(workflowPathFor('security-reviewer')).toBe('.github/workflows/devdigest-review-security-reviewer.yml');
    expect(workflowPathFor('lint-bot')).not.toBe(workflowPathFor('security-reviewer'));
  });

  it('its own output passes the workflow check with no risks (generator and checker agree)', () => {
    const { text } = gen();
    expect(checkWorkflow(text)).toEqual({ yaml_error: null, risks: [] });
  });
});
