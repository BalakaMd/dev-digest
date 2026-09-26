import type { SmartDiffRole } from '@devdigest/shared';

/**
 * Smart Diff role classification: the fixed display order and the
 * precedence-ordered classification rules (first match wins). Both live in
 * one file so the order and the rules that produce it are edited together.
 * See `client/.../DiffTab/constants.ts` `ROLE_I18N` for the client-side twin
 * (a `Record<SmartDiffRole, …>`, so a missing role fails typecheck there).
 */
export const SMART_DIFF_ROLE_ORDER = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const satisfies readonly SmartDiffRole[];

export const SMART_DIFF_RULES: ReadonlyArray<{
  role: SmartDiffRole;
  patterns: readonly string[];
}> = [
  {
    role: 'boilerplate',
    patterns: [
      '*.lock',
      'pnpm-lock.yaml',
      'package-lock.json',
      'yarn.lock',
      'dist/**',
      'build/**',
      '**/__snapshots__/**',
      '*.snap',
      '*.generated.*',
      '*.min.js',
    ],
  },
  {
    role: 'tests',
    patterns: [
      '**/*.test.ts',
      '**/*.test.tsx',
      '**/*.it.test.ts',
      '**/*.spec.ts',
      '**/test/**',
      '**/tests/**',
      '**/__tests__/**',
      'e2e/**',
    ],
  },
  {
    role: 'wiring',
    patterns: [
      'index.ts',
      'index.js',
      '*.config.*',
      'tsconfig*.json',
      '.eslintrc*',
      '.env*',
      'docker-compose*.yml',
      '.github/**',
      '.claude/**',
    ],
  },
  {
    role: 'docs',
    patterns: ['**/*.md', 'docs/**', 'README*', 'CHANGELOG*', 'LICENSE'],
  },
];

/** A path matching no rule (typically application/source code) falls here. */
export const SMART_DIFF_FALLBACK_ROLE: SmartDiffRole = 'core';
