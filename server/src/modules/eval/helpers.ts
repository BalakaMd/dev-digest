import type { EvalExpectation, UnifiedDiff } from '@devdigest/shared';
import { EVAL_DEFAULT_SLUG, EVAL_SLUG_MAX } from './constants.js';

/** Pure helpers for eval cases (AC-8, AC-13, AC-75). No IO. */

/** AC-8: lower-case words joined by `-`; bounded length; empty result -> `eval-case`. */
export function slugify(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .slice(0, EVAL_SLUG_MAX)
    .replace(/-+$/, '');
  return slug || EVAL_DEFAULT_SLUG;
}

/** AC-8: `base`, else `base-2`, `base-3`, ... the first name not in `taken`. */
export function uniqueName(base: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let n = 2; ; n += 1) {
    const candidate = `${base}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}

/**
 * AC-13: the exact patch block of one file (`diff --git a/<p> b/<p>` up to the
 * next file header), new-side line numbers preserved. Returns `null` when the
 * file is not in the diff - unlike reviewer-core's `sliceDiff` it never falls
 * back to the whole diff.
 */
export function patchForFile(diffRaw: string, path: string): string | null {
  const lines = diffRaw.split('\n');
  const suffix = ` b/${path}`;
  const out: string[] = [];
  let capture = false;
  for (const line of lines) {
    if (line.startsWith('diff --git ')) capture = line.startsWith('diff --git a/') && line.endsWith(suffix); // also matches a rename's new path
    if (capture) out.push(line);
  }
  if (out.length === 0) return null;
  while (out.length > 0 && out[out.length - 1] === '') out.pop();
  return `${out.join('\n')}\n`;
}

/** Paths of the files in a parsed diff, in diff order. */
export function filesOf(diff: UnifiedDiff): string[] {
  return diff.files.map((f) => f.path);
}

/**
 * AC-75: reasons an expectation set does not fit the case diff. One string per
 * problem, `[]` when everything fits. A reversed range is normalised first.
 */
export function validateExpectationsAgainstDiff(
  diff: UnifiedDiff,
  expectations: Pick<EvalExpectation, 'file' | 'start_line' | 'end_line'>[],
): string[] {
  const reasons: string[] = [];
  expectations.forEach((exp, i) => {
    const label = `Expectation ${i + 1}`;
    const file = diff.files.find((f) => f.path === exp.file);
    if (!file) {
      reasons.push(`${label}: file '${exp.file}' is not in the case diff`);
      return;
    }
    const lo = Math.min(exp.start_line, exp.end_line);
    const hi = Math.max(exp.start_line, exp.end_line);
    const hit = file.hunks.some((h) => {
      if (h.newLineNumbers && h.newLineNumbers.length > 0) {
        return h.newLineNumbers.some((n) => n >= lo && n <= hi);
      }
      return h.newLines > 0 && h.newStart <= hi && h.newStart + h.newLines - 1 >= lo;
    });
    if (!hit) {
      reasons.push(`${label}: lines ${lo}-${hi} of '${exp.file}' do not intersect any hunk of the case diff`);
    }
  });
  return reasons;
}
