import {
  CI_MANIFEST_DIR,
  CI_SKILLS_DIR,
  CI_WORKFLOW_DIR,
  CI_WORKFLOW_PREFIX,
} from './constants.js';

/** Pure helpers for the ci module — paths and URL/repo validation. No IO. */

/** `.github/workflows/devdigest-review-<slug>.yml` (AC-76). */
export function workflowPathFor(agentSlug: string): string {
  return `${CI_WORKFLOW_DIR}/${CI_WORKFLOW_PREFIX}${agentSlug}.yml`;
}

/** `.devdigest/agents/<slug>.yaml`. */
export function manifestPathFor(agentSlug: string): string {
  return `${CI_MANIFEST_DIR}/${agentSlug}.yaml`;
}

/** `.devdigest/skills/<slug>.md`. */
export function skillPathFor(skillSlug: string): string {
  return `${CI_SKILLS_DIR}/${skillSlug}.md`;
}

const REPO_RE = /^([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})$/;

/** Parse `owner/name`; null when it is not a plain GitHub repo slug. */
export function parseRepoSlug(repo: string): { owner: string; name: string } | null {
  const m = REPO_RE.exec(repo.trim());
  if (!m) return null;
  const name = m[2]!;
  if (name === '.' || name === '..') return null;
  return { owner: m[1]!, name };
}

/** True only for https URLs on github.com (NFR-2: links point to GitHub only). */
export function isGithubUrl(value: string | null | undefined): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === 'https:' && u.hostname === 'github.com' && !u.username && !u.password;
  } catch {
    return false;
  }
}

/** Reject paths that could escape the repository root or are not repo-relative. */
export function isSafeRepoPath(path: string): boolean {
  if (!path || path.startsWith('/') || path.includes('\\') || path.includes('\0')) return false;
  return path.split('/').every((seg) => seg !== '' && seg !== '.' && seg !== '..');
}
