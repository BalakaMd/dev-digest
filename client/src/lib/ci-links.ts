/* ci-links.ts — safe github.com links for the CI features. Server-supplied URLs are
   rendered as links only when they point at github.com over https (NFR-2). */

const GITHUB_HOST = "github.com";

/** True only for an absolute https://github.com/... URL (no other scheme or host). */
export function isGithubUrl(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" && u.hostname === GITHUB_HOST;
  } catch {
    return false;
  }
}

/** https://github.com/{owner}/{repo}/settings/secrets/actions — where the user adds Actions secrets. */
export function githubSecretsUrl(repoFullName: string): string {
  const path = repoFullName.split("/").map(encodeURIComponent).join("/");
  return `https://${GITHUB_HOST}/${path}/settings/secrets/actions`;
}
