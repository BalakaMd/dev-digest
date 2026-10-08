import { it, expect } from 'vitest';
import { hasDocker, strict } from './harness.js';

/**
 * SPEC-06 I2 / T-10 — `pnpm verify:l06` sets EVAL_VERIFY_STRICT=1. The eval it-suites skip
 * themselves without Docker, which would let the script go green with every DB test skipped.
 * In strict mode this guard (and `describeDb`) turns a missing Docker into a failure.
 */
it('strict mode requires Docker, so the DB-backed eval suites cannot be skipped silently', () => {
  if (strict) expect(hasDocker, 'EVAL_VERIFY_STRICT=1 but Docker is not available').toBe(true);
  else expect(true).toBe(true);
});
