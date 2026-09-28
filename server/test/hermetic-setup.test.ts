import { homedir } from 'node:os';
import { join } from 'node:path';
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../src/platform/config.js';
import { LocalSecretsProvider } from '../src/adapters/secrets/local.js';

// Guards test/setup/hermetic.ts: the secrets store every unmocked Container
// builds must resolve no provider key, even on a machine that has real ones.
describe('hermetic test setup', () => {
  const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

  it('points the secrets store away from ~/.devdigest', () => {
    expect(config.secretsPath).not.toBe(join(homedir(), '.devdigest', 'secrets.json'));
  });

  it.each(['OPENROUTER_API_KEY', 'OPENAI_API_KEY', 'ANTHROPIC_API_KEY', 'GITHUB_TOKEN'])(
    'resolves no %s',
    async (key) => {
      const secrets = new LocalSecretsProvider(config.secretsPath);
      expect(await secrets.get(key)).toBeFalsy();
    },
  );
});
