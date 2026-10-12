import { stringify } from 'yaml';
import { CI_RESULT_FILE_NAME, CI_RUNNER_ENV, ciArtifactName } from '@devdigest/shared';
import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import { FORK_GATE_EXPR, GITHUB_TOKEN_EXPR, OPENROUTER_SECRET_EXPR, CI_RUNNER_ENTRY } from './constants.js';

export interface WorkflowInput {
  agentSlug: string;
  triggers: readonly CiTrigger[];
  postAs: CiPostAs;
}

/**
 * Generate the per-agent GitHub Actions workflow
 * `.github/workflows/devdigest-review-<slug>.yml`.
 *
 * Security shape (AC-17…AC-22, AC-73, NFR-1): only the `pull_request` trigger,
 * exactly `contents: read` + `pull-requests: write`, secrets referenced only as
 * `${{ secrets.* }}`, the job skipped for fork PRs, and the result uploaded as an
 * artifact even when the review step fails. `slug` is validated upstream
 * (`^[a-z0-9][a-z0-9-]*$`) and triggers/postAs are enums, so nothing here is
 * free text except the agent name inside a comment-free YAML string.
 */
export function generateWorkflow(input: WorkflowInput): string {
  const { agentSlug, triggers, postAs } = input;
  const workflow = {
    name: `DevDigest review (${agentSlug})`,
    on: { pull_request: { types: [...triggers] } },
    permissions: { contents: 'read', 'pull-requests': 'write' },
    jobs: {
      review: {
        'runs-on': 'ubuntu-latest',
        if: FORK_GATE_EXPR,
        steps: [
          {
            uses: 'actions/checkout@v4',
            with: { ref: '${{ github.event.pull_request.head.sha }}', 'fetch-depth': 0 },
          },
          { uses: 'actions/setup-node@v4', with: { 'node-version': 22 } },
          {
            name: 'Run DevDigest review',
            run: `node ${CI_RUNNER_ENTRY}`,
            env: {
              OPENROUTER_API_KEY: OPENROUTER_SECRET_EXPR,
              GITHUB_TOKEN: GITHUB_TOKEN_EXPR,
              GITHUB_REPOSITORY: '${{ github.repository }}',
              PR_NUMBER: '${{ github.event.pull_request.number }}',
              [CI_RUNNER_ENV.AGENT_SLUG]: agentSlug,
              [CI_RUNNER_ENV.POST_AS]: postAs,
            },
          },
          {
            name: 'Upload DevDigest result',
            if: 'always()',
            uses: 'actions/upload-artifact@v4',
            with: {
              name: ciArtifactName(agentSlug, '${{ github.run_attempt }}'),
              path: CI_RESULT_FILE_NAME,
              'if-no-files-found': 'ignore',
            },
          },
        ],
      },
    },
  };
  return stringify(workflow, { lineWidth: 0 });
}
