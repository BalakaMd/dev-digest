import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/config.js';
// Proves the tsconfig path alias to the server's vendored shared contracts
// resolves at typecheck time (S3 "Done when").
import type { PrMeta } from '@devdigest/shared';

describe('loadConfig', () => {
  it('defaults to localhost:3001 and a 10s timeout when unset', () => {
    const config = loadConfig({} as NodeJS.ProcessEnv);
    expect(config.apiUrl).toBe('http://localhost:3001');
    expect(config.httpTimeoutMs).toBe(10_000);
  });

  it('reads DEVDIGEST_API_URL and DEVDIGEST_MCP_HTTP_TIMEOUT_MS when set', () => {
    const config = loadConfig({
      DEVDIGEST_API_URL: 'http://localhost:4001',
      DEVDIGEST_MCP_HTTP_TIMEOUT_MS: '5000',
    } as unknown as NodeJS.ProcessEnv);
    expect(config.apiUrl).toBe('http://localhost:4001');
    expect(config.httpTimeoutMs).toBe(5000);
  });

  it('rejects an invalid URL with a readable message (no raw ZodError)', () => {
    expect(() => loadConfig({ DEVDIGEST_API_URL: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow(
      /Invalid DevDigest MCP configuration/,
    );
  });
});

/** Type-only use, so `tsc` proves the alias without a runtime dependency. */
export type _AliasProbe = PrMeta;
