/**
 * Hand-written glob → RegExp, gitignore-style (D4). No new dependency: the
 * server has no glob library and the plan forbids adding one.
 *
 * - A pattern without `/` matches the basename at any depth
 *   (`isBasenamePattern`).
 * - A pattern with `/` is anchored at the repo root, unless it starts with
 *   `**\/` (matches zero or more leading directories).
 * - `*` does not cross `/`; a trailing `/**` matches the rest of the path.
 * - Matching is case-sensitive.
 */

const REGEX_SPECIAL = '.+^${}()|[]\\';

/** A pattern with no `/` matches the basename at any depth. */
export function isBasenamePattern(pattern: string): boolean {
  return !pattern.includes('/');
}

export function globToRegExp(pattern: string): RegExp {
  let source = '';
  let i = 0;
  const len = pattern.length;
  while (i < len) {
    if (pattern.startsWith('**/', i)) {
      source += '(?:.*/)?';
      i += 3;
      continue;
    }
    if (i + 3 === len && pattern.startsWith('/**', i)) {
      source += '/.*';
      i += 3;
      continue;
    }
    const ch = pattern[i]!;
    if (ch === '*') {
      source += '[^/]*';
    } else if (REGEX_SPECIAL.includes(ch)) {
      source += `\\${ch}`;
    } else {
      source += ch;
    }
    i += 1;
  }
  return new RegExp(`^${source}$`);
}
