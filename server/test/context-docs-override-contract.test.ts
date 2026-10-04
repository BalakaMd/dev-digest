import { describe, it, expect } from 'vitest';
import { LocalDocWriteBody, KeepCopyBody, RunTrace } from '@devdigest/shared';

/**
 * Shared-contract rules of SPEC-02 (local override of a repository context
 * document): the explicit override intent of a create request (AC-7) and the
 * trace's override indicator (AC-17). Pure schema tests, no IO.
 */

const SHA = 'a'.repeat(64);
const base = { folder: 'docs', name: 'guide.md', content: '# copy' };

describe('LocalDocWriteBody override intent (AC-7)', () => {
  it('accepts a plain create/update body without the intent, and a create with intent and a sha256 origin', () => {
    expect(LocalDocWriteBody.safeParse(base).success).toBe(true);
    expect(LocalDocWriteBody.safeParse({ ...base, base_version: 'v1' }).success).toBe(true);
    const intent = LocalDocWriteBody.safeParse({ ...base, override_repo: true, origin_version: SHA });
    expect(intent.success).toBe(true);
  });

  it.each([
    ['intent without an origin version', { override_repo: true }, 'origin_version'],
    ['an origin version without the intent', { origin_version: SHA }, 'override_repo'],
    ['intent together with base_version (update path)', { override_repo: true, origin_version: SHA, base_version: 'v1' }, 'override_repo'],
  ])('rejects %s and points at the field', (_label, extra, field) => {
    const res = LocalDocWriteBody.safeParse({ ...base, ...extra });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues.some((i) => i.path.includes(field))).toBe(true);
  });

  it.each([
    ['too short', 'abc123'],
    ['upper-case hex', 'A'.repeat(64)],
    ['not hex', 'g'.repeat(64)],
    ['a path-like string', '../../etc/passwd'],
    ['65 characters', 'a'.repeat(65)],
  ])('rejects an origin_version that is %s', (_label, origin_version) => {
    expect(LocalDocWriteBody.safeParse({ ...base, override_repo: true, origin_version }).success).toBe(false);
  });

  it('rejects override_repo: false (only the literal true states the intent)', () => {
    expect(LocalDocWriteBody.safeParse({ ...base, override_repo: false, origin_version: SHA }).success).toBe(false);
  });
});

describe('KeepCopyBody', () => {
  it('takes a repo-relative .md path and rejects an escaping or absolute one', () => {
    expect(KeepCopyBody.safeParse({ path: 'docs/guide.md' }).success).toBe(true);
    for (const path of ['../docs/guide.md', '/etc/passwd.md', 'docs/guide.txt', '']) {
      expect(KeepCopyBody.safeParse({ path }).success, path).toBe(false);
    }
  });
});

describe('RunTrace context docs override indicator (AC-17)', () => {
  const trace = (docs: unknown[]) => ({
    config: { agent: 'A', version: 'v1', model: 'm', pr: 1, source: 'local' },
    stats: { duration_ms: 1, tokens_in: 1, tokens_out: 1, cost_usd: 0, findings: 0, grounding: '0/0 passed' },
    prompt_assembly: { system: 's', user: 'u' },
    tool_calls: [],
    raw_output: '',
    memory_pulled: [],
    specs_read: [],
    context: { docs, tokens: 3, skipped: [] },
    log: [],
  });

  it('parses a trace written before the feature (no overrides_repo) unchanged', () => {
    const res = RunTrace.safeParse(trace([{ path: 'docs/a.md', source: 'local', tokens: 3 }]));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.context!.docs[0]).toEqual({ path: 'docs/a.md', source: 'local', tokens: 3 });
  });

  it('keeps overrides_repo on a document that overrides a repository document', () => {
    const res = RunTrace.safeParse(trace([{ path: 'docs/a.md', source: 'local', tokens: 3, overrides_repo: true }]));
    expect(res.success).toBe(true);
    if (res.success) expect(res.data.context!.docs[0]!.overrides_repo).toBe(true);
  });
});
