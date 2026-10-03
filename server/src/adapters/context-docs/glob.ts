/**
 * Pure glob helpers for the context-document reader. Supports `**` (also zero
 * directories when written `**\/`), `*`, `?` and one level of `{a,b}`
 * alternatives; case-sensitive. No dependency.
 */

const TYPE_FOLDERS = ['specs', 'docs', 'insights'] as const;
export const DEFAULT_CONTEXT_GLOBS = ['**/{specs,docs,insights}/**/*.md'];

/** Expand `{a,b}` groups (no nesting) into plain patterns. */
export function expandBraces(pattern: string): string[] {
  const open = pattern.indexOf('{');
  if (open === -1) return [pattern];
  const close = pattern.indexOf('}', open);
  if (close === -1) return [pattern];
  const head = pattern.slice(0, open);
  const tail = pattern.slice(close + 1);
  const out: string[] = [];
  for (const alt of pattern.slice(open + 1, close).split(',')) {
    for (const rest of expandBraces(tail)) out.push(head + alt + rest);
  }
  return out;
}

/** Returns a short reason when the pattern list is unusable, else null. */
export function validateGlobs(patterns: string[]): string | null {
  if (patterns.length === 0) return 'empty';
  for (const p of patterns) {
    if (p.length === 0) return 'empty';
    if (p.includes('\0')) return 'contains NUL';
    if (p.startsWith('/') || /^[A-Za-z]:/.test(p)) return 'absolute';
    if (p.includes('..')) return 'contains ..';
    let depth = 0;
    for (const ch of p) {
      if (ch === '{') depth += 1;
      else if (ch === '}') depth -= 1;
      if (depth < 0 || depth > 1) return 'unbalanced or nested braces';
    }
    if (depth !== 0) return 'unbalanced or nested braces';
    if (!expandBraces(p).every((e) => e.endsWith('.md'))) return 'not a .md pattern';
  }
  return null;
}

function toRegExp(pattern: string): RegExp {
  let re = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i]!;
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        if (pattern[i + 2] === '/') {
          re += '(?:.*/)?';
          i += 2;
        } else {
          re += '.*';
          i += 1;
        }
      } else {
        re += '[^/]*';
      }
    } else if (ch === '?') {
      re += '[^/]';
    } else {
      re += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    }
  }
  return new RegExp(`^${re}$`);
}

export function compileGlobs(patterns: string[]): (path: string) => boolean {
  const regexes = patterns.flatMap(expandBraces).map(toRegExp);
  return (path) => regexes.some((r) => r.test(path));
}

/** Name of the matching folder nearest to the file, else null (`docs/specs/x.md` → `specs`). */
export function docTypeOf(path: string): (typeof TYPE_FOLDERS)[number] | null {
  const dirs = path.split('/').slice(0, -1);
  for (let i = dirs.length - 1; i >= 0; i -= 1) {
    const d = dirs[i]!;
    if ((TYPE_FOLDERS as readonly string[]).includes(d)) return d as (typeof TYPE_FOLDERS)[number];
  }
  return null;
}

/** Literal folder names that appear in the globs (for "searched in …" texts). */
export function searchRoots(patterns: string[]): string[] {
  const roots = new Set<string>();
  for (const p of patterns.flatMap(expandBraces)) {
    for (const seg of p.split('/')) {
      if (seg && !/[*?]/.test(seg) && !seg.endsWith('.md')) roots.add(seg);
    }
  }
  return [...roots];
}
