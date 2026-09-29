import { z } from 'zod';

/**
 * Env config, Zod-parsed once at startup. No secrets live here (per
 * `CLAUDE.md` Gotchas) — the MCP only reads the booleans from
 * `GET /settings/secrets-status`, never a key value.
 */
const ConfigSchema = z.object({
  DEVDIGEST_API_URL: z.string().url().default('http://localhost:3001'),
  DEVDIGEST_MCP_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
});

export interface McpConfig {
  apiUrl: string;
  httpTimeoutMs: number;
}

/**
 * Parse `env` into an `McpConfig`. Throws a readable `Error` (not a raw Zod
 * error) on an invalid value, since `index.ts` has nowhere but stderr to show
 * it before the transport is even up.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new Error(`Invalid DevDigest MCP configuration — ${issues}`);
  }
  return {
    apiUrl: parsed.data.DEVDIGEST_API_URL,
    httpTimeoutMs: parsed.data.DEVDIGEST_MCP_HTTP_TIMEOUT_MS,
  };
}
