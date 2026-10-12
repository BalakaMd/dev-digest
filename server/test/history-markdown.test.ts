import { describe, it, expect } from 'vitest';
import type { PrHistoryItem, PrHistoryResponse } from '@devdigest/shared';
import { renderHistoryMarkdown } from '../src/modules/history/render.js';

const item = (n: number, over: Partial<PrHistoryItem> = {}): PrHistoryItem => ({
  pr_number: n,
  title: `Fix thing ${n}`,
  merged_at: `2026-02-0${n}T10:00:00Z`,
  author: 'alice',
  files_overlap: ['src/a.ts'],
  notes: '',
  ...over,
});

const ok = (...items: PrHistoryItem[]): PrHistoryResponse => ({
  history: items,
  degraded: false,
  degraded_reason: null,
});

describe('renderHistoryMarkdown', () => {
  it('starts with a heading naming the pull request', () => {
    const md = renderHistoryMarkdown(ok(item(1)), { title: 'Add retries' });

    expect(md.split('\n')[0]).toBe('# History for Add retries');
  });

  it('lists each prior PR with its number, title, merge date and author', () => {
    const md = renderHistoryMarkdown(ok(item(1), item(2)), { title: 'x' });

    expect(md).toContain('## #1 Fix thing 1');
    expect(md).toContain('Merged 2026-02-01 by @alice');
    expect(md).toContain('## #2 Fix thing 2');
  });

  it('lists the shared files and omits the block when there are none', () => {
    const md = renderHistoryMarkdown(
      ok(item(1, { files_overlap: ['src/a.ts', 'src/b.ts'] }), item(2, { files_overlap: [] })),
      { title: 'x' },
    );

    expect(md).toContain('- src/a.ts\n- src/b.ts');
    expect(md.match(/Shared files:/g)).toHaveLength(1);
  });

  it('prints the notes of a PR when it has any', () => {
    const md = renderHistoryMarkdown(ok(item(1, { notes: 'Reverted once in #9.' })), { title: 'x' });

    expect(md).toContain('Reverted once in #9.');
  });

  it('says so when no earlier PR touched the files', () => {
    const md = renderHistoryMarkdown(ok(), { title: 'x' });

    expect(md).toContain('No earlier merged pull requests touched these files.');
  });

  it.each([
    ['no_token', 'No GitHub token is configured'],
    ['github_error', 'GitHub could not be reached'],
    ['no_files', 'no changed files'],
  ] as const)('explains a degraded result (%s)', (reason, text) => {
    const md = renderHistoryMarkdown({ history: [], degraded: true, degraded_reason: reason }, { title: 'x' });

    expect(md).toContain(text);
  });

  it('caps the list at the limit and reports how many were left out', () => {
    const md = renderHistoryMarkdown(ok(item(1), item(2), item(3)), { title: 'x', limit: 2 });

    expect(md).toContain('## #2');
    expect(md).not.toContain('## #3');
    expect(md).toContain('…and 1 more.');
  });

  it('ends with a trailing newline', () => {
    expect(renderHistoryMarkdown(ok(item(1)), { title: 'x' }).endsWith('\n')).toBe(true);
  });
});
