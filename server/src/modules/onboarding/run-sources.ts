import type { GitClient, RepoRef } from '@devdigest/shared';
import { MAX_RUN_SOURCES_TOTAL_CHARS } from './constants.js';
import { boundText, extractScripts, runSourceCandidates } from './helpers.js';
import type { RunSource } from './types.js';

/**
 * Read the repository's own run sources through the VCS port — ONLY fixed file
 * names (see `runSourceCandidates`), never a path from model output. Missing
 * files are skipped; `package.json` contributes its `scripts` only; every file
 * and the total are size-bounded. Nothing is executed or written.
 */
export async function collectRunSources(
  git: GitClient,
  repo: RepoRef,
  indexedPaths: string[],
): Promise<RunSource[]> {
  const out: RunSource[] = [];
  let total = 0;
  for (const name of runSourceCandidates(indexedPaths)) {
    if (total >= MAX_RUN_SOURCES_TOTAL_CHARS) break;
    let raw: string;
    try {
      raw = await git.readFile(repo, name);
    } catch {
      continue;
    }
    const text = name.endsWith('package.json') ? extractScripts(raw) : raw.trim() ? raw : null;
    if (!text) continue;
    const content = boundText(text).slice(0, MAX_RUN_SOURCES_TOTAL_CHARS - total);
    total += content.length;
    out.push({ name, content });
  }
  return out;
}
