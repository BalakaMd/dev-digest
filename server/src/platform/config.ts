import 'dotenv/config';
import { z } from 'zod';
import { homedir } from 'node:os';
import { join, isAbsolute, resolve } from 'node:path';
import { DEFAULT_CONTEXT_GLOBS, validateGlobs } from '../adapters/context-docs/glob.js';

/**
 * Central, zod-validated environment config. Loaded once at startup.
 *
 * NOTE: secret keys (OPENAI/ANTHROPIC/OPENROUTER/GITHUB_TOKEN) are deliberately
 * NOT in this schema. Feature code must access secrets through SecretsProvider,
 * never via process.env or AppConfig — the SecretsProvider is the one chokepoint
 * that reads process.env directly (see adapters/secrets/local.ts). Listing them
 * here would be dead config that never reaches AppConfig.
 */
const EnvSchema = z.object({
  DATABASE_URL: z
    .string()
    .default('postgres://devdigest:devdigest@localhost:5433/devdigest'),
  // Memory/RAG embeddings run on OpenAI (text-embedding-3-small, 1536-dim — the
  // pgvector columns are locked to that). Default OFF so the app makes ZERO
  // OpenAI requests; set EMBEDDINGS_ENABLED=true to turn memory retrieval on.
  EMBEDDINGS_ENABLED: z.string().optional(),
  // repo-intel facade (Tier 1). Default ON — reviews get repo skeleton +
  // callers context. Set REPO_INTEL_ENABLED=false to opt out, in which case
  // every consumer degrades to ripgrep-identical behavior (acceptance #10).
  // Note: even when on, sections only populate once the repo is indexed; an
  // unindexed repo degrades gracefully. Per-agent override: agents.repo_intel.
  REPO_INTEL_ENABLED: z.string().optional(),
  API_PORT: z.coerce.number().int().default(3001),
  WEB_PORT: z.coerce.number().int().default(3000),
  DEVDIGEST_CLONE_DIR: z.string().optional(),
  // Where BYO keys entered in the UI are stored. Tests point it at an empty
  // temp dir (test/setup/hermetic.ts) so a developer's real keys never load.
  DEVDIGEST_SECRETS_PATH: z.string().optional(),
  // Context-document reader: `;`-separated search globs (default
  // `**/{specs,docs,insights}/**/*.md`) and the local-document root.
  CONTEXT_DOC_GLOBS: z.string().optional(),
  DEVDIGEST_CONTEXT_DIR: z.string().optional(),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  // `.env` (and .env.example) ship `LOG_LEVEL=` empty; an empty string is not a
  // valid enum member, so coerce '' → undefined to fall through to the default.
  LOG_LEVEL: z.preprocess(
    (v) => (v === '' ? undefined : v),
    z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).optional(),
  ),
});

export type AppConfig = {
  databaseUrl: string;
  apiPort: number;
  webPort: number;
  /** Absolute path where repos are cloned (~/.devdigest/workspace by default). */
  cloneDir: string;
  /** Absolute path to the writable secrets store (BYO keys from the UI). */
  secretsPath: string;
  /** Search globs of the context-document reader (read once at start). */
  contextDocGlobs: string[];
  /** Absolute path of the local context-document root (`~/.devdigest/context`). */
  contextDir: string;
  /** The rejected `CONTEXT_DOC_GLOBS` value when it was invalid (default globs in use), else null. */
  contextDocGlobsRejected: string | null;
  nodeEnv: 'development' | 'test' | 'production';
  logLevel: string;
  /** Allowed CORS origin for the Next.js dev server. */
  webOrigin: string;
  /** Whether memory/RAG embeddings (OpenAI) are enabled. Default false. */
  embeddingsEnabled: boolean;
  /**
   * Whether the repo-intel facade (Tier 1: phantom-gate, callers-in-prompt) is
   * active. Default ON — set REPO_INTEL_ENABLED=false to opt out, in which case
   * every facade method returns its degraded result (`[]`) so consumers behave
   * EXACTLY like the ripgrep-only baseline.
   */
  repoIntelEnabled: boolean;
};

/**
 * `CONTEXT_DOC_GLOBS`: unset or blank → defaults silently; otherwise `;`-split,
 * and any invalid value (empty, NUL, absolute, `..`, unbalanced braces, not
 * `.md`) falls back to the defaults and is reported via `rejected`.
 */
function parseContextDocGlobs(raw: string | undefined): { globs: string[]; rejected: string | null } {
  if (raw === undefined || raw === '') return { globs: [...DEFAULT_CONTEXT_GLOBS], rejected: null };
  const globs = raw.split(';').map((g) => g.trim()).filter((g) => g.length > 0);
  if (validateGlobs(globs) !== null) return { globs: [...DEFAULT_CONTEXT_GLOBS], rejected: raw };
  return { globs, rejected: null };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = EnvSchema.parse(env);
  const cloneDirRaw =
    parsed.DEVDIGEST_CLONE_DIR ?? join(homedir(), '.devdigest', 'workspace');
  const cloneDir = isAbsolute(cloneDirRaw) ? cloneDirRaw : resolve(process.cwd(), cloneDirRaw);
  const secretsPathRaw =
    parsed.DEVDIGEST_SECRETS_PATH ?? join(homedir(), '.devdigest', 'secrets.json');
  const secretsPath = isAbsolute(secretsPathRaw)
    ? secretsPathRaw
    : resolve(process.cwd(), secretsPathRaw);
  const contextDirRaw =
    parsed.DEVDIGEST_CONTEXT_DIR ?? join(homedir(), '.devdigest', 'context');
  const contextDir = isAbsolute(contextDirRaw) ? contextDirRaw : resolve(process.cwd(), contextDirRaw);
  const ctxGlobs = parseContextDocGlobs(parsed.CONTEXT_DOC_GLOBS);
  return {
    databaseUrl: parsed.DATABASE_URL,
    apiPort: parsed.API_PORT,
    webPort: parsed.WEB_PORT,
    cloneDir,
    secretsPath,
    contextDocGlobs: ctxGlobs.globs,
    contextDir,
    contextDocGlobsRejected: ctxGlobs.rejected,
    nodeEnv: parsed.NODE_ENV,
    logLevel: parsed.LOG_LEVEL ?? (parsed.NODE_ENV === 'test' ? 'silent' : 'info'),
    webOrigin: `http://localhost:${parsed.WEB_PORT}`,
    embeddingsEnabled: parsed.EMBEDDINGS_ENABLED === 'true',
    repoIntelEnabled: parsed.REPO_INTEL_ENABLED !== 'false',
  };
}
