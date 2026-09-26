import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Hermetic-by-default guard, loaded via `setupFiles` before every test file.
 *
 * `LocalSecretsProvider` reads keys from `~/.devdigest/secrets.json` and falls
 * back to `process.env`, so on a developer machine an unmocked provider path
 * would build a REAL OpenRouter / OpenAI / Anthropic / GitHub client. Blanking
 * the keys (empty string, not `delete`, so `dotenv` does not refill them from
 * `.env`) and pointing the store at a fresh, empty temp dir makes such a path
 * throw `ConfigError` instead. A test that needs a key injects
 * `secrets: new MockSecretsProvider({ ... })` or an explicit `llm`/`github`
 * override.
 */
const PROVIDER_KEYS = [
  'OPENROUTER_API_KEY',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'GITHUB_TOKEN',
  'GITHUB_PAT',
] as const;

for (const key of PROVIDER_KEYS) process.env[key] = '';

// A unique dir per test file: a test that writes a key through the store
// cannot leak it into another file or a later run.
process.env.DEVDIGEST_SECRETS_PATH = join(
  mkdtempSync(join(tmpdir(), 'devdigest-test-secrets-')),
  'secrets.json',
);
