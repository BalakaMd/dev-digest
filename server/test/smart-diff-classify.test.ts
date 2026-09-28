/**
 * Table test for the Smart Diff classifier: "path → role" (S2, `classify.ts`).
 * Rows come straight from the plan's test list, including the 3 contested
 * cases and the D4 root-anchoring case — each carries a comment recording the
 * decision that produced it.
 */
import { describe, it, expect } from 'vitest';
import { SmartDiffRole } from '@devdigest/shared';
import { classifyFile, SMART_DIFF_ROLE_ORDER } from '../src/modules/reviews/smart-diff/index.js';

describe('classifyFile — path → role', () => {
  it.each<[string, SmartDiffRole]>([
    // ---- boilerplate ------------------------------------------------------
    ['pnpm-lock.yaml', 'boilerplate'],
    ['server/pnpm-lock.yaml', 'boilerplate'], // basename pattern matches at any depth
    ['Cargo.lock', 'boilerplate'],
    ['dist/a.js', 'boilerplate'],
    ['x/y.min.js', 'boilerplate'],
    ['a.generated.ts', 'boilerplate'],

    // ---- tests --------------------------------------------------------------
    ['src/a.test.tsx', 'tests'],
    ['x.it.test.ts', 'tests'],
    ['src/test/a.ts', 'tests'],
    ['e2e/specs/a.json', 'tests'],

    // ---- wiring -------------------------------------------------------------
    ['server/src/modules/index.ts', 'wiring'],
    ['vitest.config.ts', 'wiring'],
    ['tsconfig.build.json', 'wiring'],
    ['.env.example', 'wiring'],
    ['.github/workflows/ci.yml', 'wiring'],

    // ---- docs -----------------------------------------------------------
    ['docs/a.txt', 'docs'],
    ['client/README.md', 'docs'],
    ['LICENSE', 'docs'],

    // ---- core (fallback: no rule matches) ------------------------------
    ['src/app.ts', 'core'],
    ['src/index.tsx', 'core'], // NOT `index.ts`/`index.js` — the wiring rule is extension-exact

    // ---- the 3 contested rows (each records the deliberate decision) --
    // Boilerplate precedes tests in `SMART_DIFF_RULES`, and `**/__snapshots__/**`
    // matches before `**/__tests__/**` is ever checked.
    ['__tests__/__snapshots__/x.snap', 'boilerplate'],
    // `.claude/**` is a wiring pattern, and wiring precedes docs — it wins over
    // the `**/*.md` docs pattern that would otherwise also match this path.
    ['.claude/skills/security/SKILL.md', 'wiring'],
    // `e2e/**` is a *tests* pattern (S2 constants). tests precedes docs, so
    // this beats `README*`/`**/*.md` — the deliberate decision that e2e/**
    // wins over docs for anything under e2e/.
    ['e2e/README.md', 'tests'],

    // ---- D4 root-anchoring: `dist/**` (no leading `**/`) is anchored at the
    // repo root, so a nested `dist/` does NOT match and falls back to core.
    ['client/dist/x.js', 'core'],
  ])('%s → %s', (path, role) => {
    expect(classifyFile(path)).toBe(role);
  });

  it('SMART_DIFF_ROLE_ORDER is exactly the SmartDiffRole enum values, in the fixed display order', () => {
    expect(new Set(SMART_DIFF_ROLE_ORDER)).toEqual(new Set(SmartDiffRole.options));
    expect(SMART_DIFF_ROLE_ORDER).toEqual(SmartDiffRole.options);
  });
});
