import { describe, it, expect } from 'vitest';
import { strToU8, zipSync } from 'fflate';
import { CI_ARTIFACT_MAX_BYTES, CI_RESULT_FILE_NAME } from '@devdigest/shared';
import { readResultArtifact } from '../../src/modules/ci/artifact.js';

/** T-12 — result artifact reader (AC-57, NFR-2, EC-27): size cap before parse, hostile zips, schema. */
const zipOf = (files: Record<string, Uint8Array | string>) =>
  zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, typeof v === 'string' ? strToU8(v) : v])));
const result = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ findings_count: 1, cost_usd: 0.01, agent: 'Reviewer', verdict: 'comment', blockers: 0, ...over });

/** A valid result JSON of exactly `bytes` bytes (padding lives in `agent`). */
const resultOfSize = (bytes: number) => {
  const empty = result({ agent: '' });
  return result({ agent: 'a'.repeat(bytes - empty.length) });
};

describe('readResultArtifact', () => {
  it('returns the validated result from a well-formed artifact', () => {
    const r = readResultArtifact(zipOf({ [CI_RESULT_FILE_NAME]: result() }));
    expect(r).toEqual({
      ok: true,
      result: expect.objectContaining({ findings_count: 1, agent: 'Reviewer', verdict: 'comment' }),
    });
  });

  it('accepts a result of exactly 1 MiB and rejects 1 MiB + 1 byte before parsing (NFR-2)', () => {
    const atLimit = resultOfSize(CI_ARTIFACT_MAX_BYTES);
    expect(Buffer.byteLength(atLimit)).toBe(CI_ARTIFACT_MAX_BYTES);
    expect(readResultArtifact(zipOf({ [CI_RESULT_FILE_NAME]: atLimit })).ok).toBe(true);

    const over = resultOfSize(CI_ARTIFACT_MAX_BYTES + 1);
    expect(Buffer.byteLength(over)).toBe(CI_ARTIFACT_MAX_BYTES + 1);
    const r = readResultArtifact(zipOf({ [CI_RESULT_FILE_NAME]: over }));
    expect(r).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it('rejects an artifact zip that is itself larger than the cap', () => {
    const noise = new Uint8Array(CI_ARTIFACT_MAX_BYTES + 1);
    for (let i = 0; i < noise.length; i++) noise[i] = (i * 2654435761) >>> 24; // incompressible-ish
    const big = zipSync({ 'noise.bin': noise }, { level: 0 });
    expect(readResultArtifact(big)).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it('refuses a zip bomb by its declared size without inflating it (EC-27)', () => {
    const bomb = zipOf({ [CI_RESULT_FILE_NAME]: new Uint8Array(50 * 1024 * 1024) });
    expect(bomb.byteLength).toBeLessThan(CI_ARTIFACT_MAX_BYTES); // small on the wire, huge when inflated
    expect(readResultArtifact(bomb)).toMatchObject({ ok: false, reason: 'too_large' });
  });

  it('reports a missing result file, bad zip, bad JSON and a schema mismatch as distinct reasons', () => {
    expect(readResultArtifact(zipOf({ 'other.json': '{}' }))).toMatchObject({ ok: false, reason: 'missing_file' });
    expect(readResultArtifact(strToU8('not a zip at all'))).toMatchObject({ ok: false, reason: 'invalid_zip' });
    expect(readResultArtifact(zipOf({ [CI_RESULT_FILE_NAME]: '{not json' }))).toMatchObject({
      ok: false,
      reason: 'invalid_json',
    });
    expect(readResultArtifact(zipOf({ [CI_RESULT_FILE_NAME]: JSON.stringify({ findings_count: 'many' }) }))).toMatchObject(
      { ok: false, reason: 'invalid_schema' },
    );
  });

  it('ignores a path-traversal entry next to the result file', () => {
    const r = readResultArtifact(zipOf({ '../evil.txt': 'x', [CI_RESULT_FILE_NAME]: result() }));
    expect(r.ok).toBe(true);
  });
});
