import type { SmartDiffRole } from '@devdigest/shared';
import { SMART_DIFF_FALLBACK_ROLE, SMART_DIFF_RULES } from './constants.js';
import { globToRegExp, isBasenamePattern } from './glob.js';

interface CompiledRule {
  role: SmartDiffRole;
  regex: RegExp;
  basename: boolean;
}

// Compiled once at module load, in `SMART_DIFF_RULES` precedence order —
// first match wins.
const COMPILED_RULES: CompiledRule[] = SMART_DIFF_RULES.flatMap((rule) =>
  rule.patterns.map((pattern) => ({
    role: rule.role,
    regex: globToRegExp(pattern),
    basename: isBasenamePattern(pattern),
  })),
);

/**
 * Classify a diff path into a display role (D4 glob semantics). Strips a
 * leading `./` or `/`; a basename-only pattern is tested against the last
 * path segment, everything else against the full (normalized) path. A path
 * matching no rule falls back to `SMART_DIFF_FALLBACK_ROLE`.
 */
export function classifyFile(path: string): SmartDiffRole {
  const normalized = path.replace(/^\.?\//, '');
  const basename = normalized.slice(normalized.lastIndexOf('/') + 1);
  for (const rule of COMPILED_RULES) {
    const subject = rule.basename ? basename : normalized;
    if (rule.regex.test(subject)) return rule.role;
  }
  return SMART_DIFF_FALLBACK_ROLE;
}
