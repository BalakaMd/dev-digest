import type { PrHistoryResponse } from '@devdigest/shared';

/**
 * Markdown rendering of `PrHistoryResponse` — the prior merged PRs that touched
 * the same files, as a document a reviewer can paste into a PR comment or a
 * ticket. Pure: no I/O, no clock.
 */

const DEGRADED_TEXT: Record<NonNullable<PrHistoryResponse['degraded_reason']>, string> = {
  no_token: 'No GitHub token is configured, so the history could not be read.',
  github_error: 'GitHub could not be reached, so the history is unavailable.',
  no_files: 'This pull request has no changed files to look up.',
};

export interface RenderHistoryOptions {
  /** Heading of the document, usually the pull request title. */
  title: string;
  /** Most prior PRs to list; the rest are summarised as "and N more". */
  limit?: number;
}

export function renderHistoryMarkdown(res: PrHistoryResponse, opts: RenderHistoryOptions): string {
  const lines = [`# History for ${opts.title}`, ''];

  if (res.degraded && res.degraded_reason) {
    lines.push(`> ${DEGRADED_TEXT[res.degraded_reason]}`, '');
    return lines.join('\n');
  }
  if (res.history.length === 0) {
    lines.push('No earlier merged pull requests touched these files.', '');
    return lines.join('\n');
  }

  const limit = opts.limit ?? res.history.length;
  const shown = res.history.slice(0, limit);
  for (const item of shown) {
    lines.push(`## #${item.pr_number} ${item.title}`);
    lines.push(`Merged ${item.merged_at.slice(0, 10)} by @${item.author}`, '');
    if (item.files_overlap.length > 0) {
      lines.push('Shared files:');
      for (const file of item.files_overlap) lines.push(`- ${file}`);
      lines.push('');
    }
    if (item.notes) lines.push(item.notes, '');
  }
  if (shown.length < res.history.length) {
    lines.push(`…and ${res.history.length - shown.length} more.`, '');
  }
  return lines.join('\n');
}
