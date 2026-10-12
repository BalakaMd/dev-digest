import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { RunnerError } from './errors.js';

/**
 * Loads the checked-in `.devdigest/skills/<slug>.md` files referenced by the
 * manifest's `skills` slugs, in order. Bodies are RESOLVED skill text (not
 * slugs) — `reviewPullRequest` (reviewer-core) takes strings, exactly like the
 * studio resolves slugs to DB rows before calling the same engine (AC-36
 * parity). The SHA-256 of each file's bytes goes into the result trace (AC-51).
 */
export interface LoadedSkill {
  slug: string;
  body: string;
  sha256: string;
}

export function loadSkills(
  devdigestDir: string,
  slugs: readonly string[],
  readFile: typeof readFileSync = readFileSync,
): LoadedSkill[] {
  return slugs.map((slug) => {
    if (slug.includes('/') || slug.includes('\\') || slug.includes('..')) {
      throw new RunnerError(`Invalid skill slug ${JSON.stringify(slug)}`);
    }
    const skillPath = path.join(devdigestDir, 'skills', `${slug}.md`);
    try {
      const bytes = Buffer.from(readFile(skillPath) as unknown as Buffer);
      return {
        slug,
        body: bytes.toString('utf8'),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    } catch (err) {
      throw new RunnerError(
        `Skill file for slug '${slug}' not found at ${skillPath}: ${(err as Error).message}`,
      );
    }
  });
}
