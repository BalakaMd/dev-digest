/** Constants for the ci module (export to CI + CI runs). Pure literals, no IO. */

/** Repo-relative locations of the files an export creates. */
export const CI_MANIFEST_DIR = '.devdigest/agents';
export const CI_SKILLS_DIR = '.devdigest/skills';
export const CI_MEMORY_PATH = '.devdigest/memory.jsonl';
export const CI_WORKFLOW_DIR = '.github/workflows';
export const CI_WORKFLOW_PREFIX = 'devdigest-review-';
/** Entry point of the bundled agent-runner, relative to the repo root. */
export const CI_RUNNER_ENTRY = '.devdigest/runner/index.js';

/** Slug rule shared by agent and skill slugs (AC-14). */
export const SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;
export const SLUG_MAX_LENGTH = 60;
export const AGENT_SLUG_FALLBACK = 'agent';
export const SKILL_SLUG_FALLBACK = 'skill';

/** Names of the Actions secrets / expressions the workflow may reference (AC-19). */
export const OPENROUTER_SECRET_EXPR = '${{ secrets.OPENROUTER_API_KEY }}';
export const GITHUB_TOKEN_EXPR = '${{ secrets.GITHUB_TOKEN }}';

/** Fork gate used by the generated workflow job (AC-22). */
export const FORK_GATE_EXPR = 'github.event.pull_request.head.repo.full_name == github.repository';

/** Shown when a GitHub write or secrets read is refused (AC-34, AC-26). */
export const CI_REQUIRED_TOKEN_PERMISSIONS =
  'GitHub token needs — classic PAT: scopes "repo" + "workflow"; fine-grained PAT: Metadata=read, Contents=write, Pull requests=write, Workflows=write, Actions=read, Secrets=read.';
