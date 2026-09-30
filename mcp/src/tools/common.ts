import { z } from 'zod';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import {
  ApiUnreachableError,
  ApiHttpError,
  ApiContractError,
} from '../api/errors.js';
import {
  UnparseableIdentifierError,
  RepoNotImportedError,
  AmbiguousRepoError,
  AmbiguousPrNumberError,
  PrNotImportedError,
  UnknownAgentError,
  AmbiguousAgentError,
} from '../resolve/resolvers.js';
import { log } from '../log.js';

/** Shared across every tool's input: `response_format` defaults to concise. */
export const ResponseFormat = z
  .enum(['concise', 'detailed'])
  .default('concise')
  .describe('How much detail to include; concise is the default.');

export const PrInput = z
  .string()
  .min(1)
  .describe('A PR as owner/repo#123 or a GitHub PR URL.');

/** A successful, non-error tool result. `structured` is only ever attached
 * when the tool declares an `outputSchema` (list_agents/conventions/blast
 * radius return text only, per § Tool contracts). */
export function ok(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structured !== undefined ? { structuredContent: structured } : {}),
    isError: false,
  };
}

/** An error result that still carries useful structured data (e.g. run_ids
 * for a `partial` run_review — not itself an error, see `toToolError` for
 * the isError:true case). */
export function fail(text: string, structured?: Record<string, unknown>): CallToolResult {
  return {
    content: [{ type: 'text', text }],
    ...(structured !== undefined ? { structuredContent: structured } : {}),
    isError: true,
  };
}

/**
 * The single error-mapping point (§ Error mapping). Never returns a stack
 * trace in the tool-facing text; the raw error always goes to stderr first.
 */
export function toToolError(err: unknown, apiUrl: string): CallToolResult {
  log.error('tool call failed', { error: err instanceof Error ? err.message : String(err), name: (err as { name?: string })?.name });

  if (err instanceof ApiUnreachableError) {
    return fail(
      `DevDigest API is not reachable at ${apiUrl}. Start it with ./scripts/dev.sh (or \`cd server && pnpm dev\`), or set DEVDIGEST_API_URL.`,
    );
  }
  if (err instanceof RepoNotImportedError) {
    const list = err.imported.length > 0 ? ` Imported: ${err.imported.join(', ')}.` : ' No repos are imported yet.';
    return fail(`${err.message} Add it in the studio (Repositories → Add).${list}`);
  }
  if (err instanceof AmbiguousRepoError || err instanceof AmbiguousPrNumberError) {
    return fail(err.message);
  }
  if (err instanceof PrNotImportedError) {
    return fail(`${err.message} Check the number, or open the repo's PR list in the studio to sync it.`);
  }
  if (err instanceof UnparseableIdentifierError) {
    return fail(err.message);
  }
  if (err instanceof UnknownAgentError || err instanceof AmbiguousAgentError) {
    return fail(err.message);
  }
  if (err instanceof ApiHttpError) {
    if (err.status === 429) {
      return fail('DevDigest rate limit hit (10 reviews/min). Wait a minute and retry.');
    }
    if (isNoKeyMessage(err.message)) {
      return fail(noKeyHint(err.message));
    }
    return fail(`DevDigest API error (${err.code}): ${err.message}`);
  }
  if (err instanceof ApiContractError) {
    log.error('contract mismatch', { route: err.route, issues: err.issues });
    return fail(
      `Unexpected response from DevDigest API for ${err.route} — the MCP and server contracts may be out of sync.`,
    );
  }
  return fail('Internal error in the DevDigest MCP server — see its stderr log.');
}

const NO_KEY_RE = /(\w+)_API_KEY is not configured/;

export function isNoKeyMessage(message: string): boolean {
  return NO_KEY_RE.test(message);
}

export function noKeyHint(message: string): string {
  const match = NO_KEY_RE.exec(message);
  const provider = match?.[1] ?? 'the provider';
  return `No ${provider} API key configured. Add it in the studio (Settings → API keys) or ~/.devdigest/secrets.json, then retry.`;
}
