import { describe, it, expect } from 'vitest';
import { unzipSync, strFromU8 } from 'fflate';
import { isGithubUrl, isSafeRepoPath, parseRepoSlug } from '../../src/modules/ci/helpers.js';
import { buildInstallZip } from '../../src/modules/ci/zip.js';

/** T-13 — install zip and URL/path guards (AC-37, NFR-2). */
describe('buildInstallZip', () => {
  it('contains exactly the given files at their repository paths, 0-byte file included (AC-37)', () => {
    const zip = buildInstallZip([
      { path: '.devdigest/agents/a.yaml', contents: 'name: a\n' },
      { path: '.devdigest/memory.jsonl', contents: '' },
      { path: '.devdigest/runner/index.js', contents: new Uint8Array([1, 2, 3]) },
      { path: '.github/workflows/devdigest-review-a.yml', contents: 'on: pull_request\n' },
    ]);
    const out = unzipSync(zip);
    expect(Object.keys(out).sort()).toEqual([
      '.devdigest/agents/a.yaml',
      '.devdigest/memory.jsonl',
      '.devdigest/runner/index.js',
      '.github/workflows/devdigest-review-a.yml',
    ]);
    expect(strFromU8(out['.devdigest/agents/a.yaml']!)).toBe('name: a\n');
    expect(out['.devdigest/memory.jsonl']!.byteLength).toBe(0);
  });

  it('refuses a path that escapes the repository root, and duplicates', () => {
    for (const path of ['../x', '/abs', 'a/../../b', 'a\\b', 'a//b']) {
      expect(() => buildInstallZip([{ path, contents: 'x' }])).toThrow(/Unsafe path/);
    }
    expect(() =>
      buildInstallZip([
        { path: 'a.txt', contents: '1' },
        { path: 'a.txt', contents: '2' },
      ]),
    ).toThrow(/Duplicate/);
  });
});

describe('isGithubUrl', () => {
  it('accepts only https URLs on github.com (NFR-2)', () => {
    expect(isGithubUrl('https://github.com/acme/repo/actions/runs/1')).toBe(true);
    for (const bad of [
      'javascript:alert(1)',
      'http://github.com/a/b',
      'https://github.com.evil.example/a',
      'https://evil.example/github.com',
      'https://user:pw@github.com/a',
      '//github.com/a',
      '',
      null,
      undefined,
    ]) {
      expect(isGithubUrl(bad as string)).toBe(false);
    }
  });
});

describe('parseRepoSlug / isSafeRepoPath', () => {
  it('parses owner/name and rejects anything else', () => {
    expect(parseRepoSlug('acme/web.app')).toEqual({ owner: 'acme', name: 'web.app' });
    for (const bad of ['acme', 'acme/..', 'a/b/c', '../x/y', 'acme/na me', '']) expect(parseRepoSlug(bad)).toBeNull();
  });

  it('rejects traversal and non-relative paths', () => {
    expect(isSafeRepoPath('.github/workflows/x.yml')).toBe(true);
    for (const bad of ['', '/etc/passwd', '../x', 'a/./b', 'a\0b']) expect(isSafeRepoPath(bad)).toBe(false);
  });
});
