/**
 * Pure identifier parsing (no API calls) for the human-readable references the
 * five tools accept. `resolvers.ts` turns a parsed ref into a repo/PR by
 * calling the API; this file only recognises the shape of the input string.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const GITHUB_PR_URL_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+)\/pull\/(\d+)(?:\/.*)?$/;
const OWNER_REPO_HASH_RE = /^([^/\s#]+)\/([^/\s#]+)#(\d+)$/;
const BARE_NUMBER_RE = /^#?(\d+)$/;

export type PrRef =
  | { kind: 'owner-repo-number'; owner: string; name: string; number: number }
  | { kind: 'bare-number'; number: number }
  /** Passes straight through as an already-resolved `pr_id` — undocumented. */
  | { kind: 'uuid'; id: string };

/**
 * `owner/repo#123`; `https://github.com/owner/repo/pull/123[/...]`; a bare
 * `123`/`#123` (the caller must additionally check exactly one repo is
 * imported); or a UUID passed straight through. `null` when none match.
 */
export function parsePrRef(input: string): PrRef | null {
  const trimmed = input.trim();
  if (UUID_RE.test(trimmed)) return { kind: 'uuid', id: trimmed };

  const urlMatch = GITHUB_PR_URL_RE.exec(trimmed);
  if (urlMatch) {
    return { kind: 'owner-repo-number', owner: urlMatch[1]!, name: urlMatch[2]!, number: Number(urlMatch[3]) };
  }

  const hashMatch = OWNER_REPO_HASH_RE.exec(trimmed);
  if (hashMatch) {
    return { kind: 'owner-repo-number', owner: hashMatch[1]!, name: hashMatch[2]!, number: Number(hashMatch[3]) };
  }

  const bareMatch = BARE_NUMBER_RE.exec(trimmed);
  if (bareMatch) return { kind: 'bare-number', number: Number(bareMatch[1]) };

  return null;
}

export type RepoRef =
  | { kind: 'owner-name'; owner: string; name: string }
  | { kind: 'bare-name'; name: string };

const GITHUB_REPO_URL_RE = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/;
const OWNER_SLASH_NAME_RE = /^([^/\s#]+)\/([^/\s#]+)$/;

/** `owner/repo`, a GitHub repo URL, or a bare `repo` (unique-name lookup). */
export function parseRepoRef(input: string): RepoRef | null {
  const trimmed = input.trim();
  const urlMatch = GITHUB_REPO_URL_RE.exec(trimmed);
  if (urlMatch) return { kind: 'owner-name', owner: urlMatch[1]!, name: urlMatch[2]! };

  const slashMatch = OWNER_SLASH_NAME_RE.exec(trimmed);
  if (slashMatch) return { kind: 'owner-name', owner: slashMatch[1]!, name: slashMatch[2]! };

  if (trimmed.length > 0) return { kind: 'bare-name', name: trimmed };
  return null;
}
