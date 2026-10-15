import { describe, it, expect } from 'vitest';
import { AgentPerformanceQuery, PERF_MAX_SPAN_MS } from '@devdigest/shared';

/**
 * SPEC-10 AC-24 / NFR-2 — the shared query schema of both Agent Performance reads rejects
 * every malformed or oversized request before any handler or query runs.
 */

const REPO_ID = '3f2b8c1e-6a4d-4e0b-9c57-1d2e3f4a5b6c';
const FROM = '2026-03-01T00:00:00.000Z';
const TO = '2026-03-31T00:00:00.000Z';
const ok = { repoId: REPO_ID, from: FROM, to: TO };

const parse = (q: unknown) => AgentPerformanceQuery.safeParse(q);
const plusMs = (iso: string, ms: number) => new Date(Date.parse(iso) + ms).toISOString();

describe('AgentPerformanceQuery (AC-24)', () => {
  it('accepts a uuid repo id and `Z` instants', () => {
    expect(parse(ok).success).toBe(true);
  });

  it('accepts offset instants', () => {
    expect(parse({ ...ok, from: '2026-03-01T02:00:00+02:00', to: '2026-03-31T00:00:00-05:00' }).success).toBe(true);
  });

  it.each<[string, unknown]>([
    ['repoId missing', { from: FROM, to: TO }],
    ['from missing', { repoId: REPO_ID, to: TO }],
    ['to missing', { repoId: REPO_ID, from: FROM }],
    ['repoId is not a uuid', { ...ok, repoId: 'acme/web' }],
    ['from is a date, not an instant', { ...ok, from: '2026-03-01' }],
    ['from has no UTC offset', { ...ok, from: '2026-03-01T00:00:00' }],
    ['to is not a date at all', { ...ok, to: 'tomorrow' }],
    ['from equals to', { ...ok, to: FROM }],
    ['from is after to', { ...ok, from: TO, to: FROM }],
  ])('rejects: %s', (_name, query) => {
    expect(parse(query).success).toBe(false);
  });

  it('allows a span of exactly 366 days plus one hour and rejects one millisecond more', () => {
    expect(PERF_MAX_SPAN_MS).toBe(366 * 24 * 3_600_000 + 3_600_000);
    expect(parse({ ...ok, to: plusMs(FROM, PERF_MAX_SPAN_MS) }).success).toBe(true);
    expect(parse({ ...ok, to: plusMs(FROM, PERF_MAX_SPAN_MS + 1) }).success).toBe(false);
  });

  it('names the offending field in the issue path', () => {
    const reversed = parse({ ...ok, from: TO, to: FROM });
    expect(reversed.success).toBe(false);
    if (!reversed.success) expect(reversed.error.issues[0]!.path).toEqual(['from']);

    const tooLong = parse({ ...ok, to: plusMs(FROM, PERF_MAX_SPAN_MS + 1) });
    expect(tooLong.success).toBe(false);
    if (!tooLong.success) expect(tooLong.error.issues[0]!.path).toEqual(['to']);
  });
});
