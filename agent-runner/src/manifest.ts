import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { parse as parseYaml } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { RunnerError } from './errors.js';

/**
 * Loads and VALIDATES the checked-in `.devdigest/agents/<slug>.yaml` manifest
 * (AC-60, AC-61). The runner reads exactly the manifest of the agent named by
 * its workflow (`DEVDIGEST_AGENT_SLUG`), whatever other manifests the repo
 * holds. The file is untrusted on-disk content by the time it reaches CI, so it
 * is schema-validated with the shared `AgentManifest` contract before any field
 * is used. Fail clearly rather than defaulting or partially trusting it.
 */

export type { AgentManifest } from '@devdigest/shared';

export interface FsDeps {
  readFile?: typeof readFileSync;
}

export interface LoadedManifest {
  manifest: AgentManifest;
  /** SHA-256 (hex) of the manifest file bytes as read in CI (AC-51). */
  sha256: string;
  path: string;
}

/** Slugs come from a workflow env var; keep them to a safe file-name alphabet. */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function sha256Hex(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** `<devdigestDir>/agents/<slug>.yaml` — the only manifest the runner reads. */
export function manifestPathFor(devdigestDir: string, slug: string): string {
  if (!SLUG_RE.test(slug) || slug.includes('..')) {
    throw new RunnerError(`Invalid agent slug ${JSON.stringify(slug)}`);
  }
  return path.join(devdigestDir, 'agents', `${slug}.yaml`);
}

/** Read, hash, parse and Zod-validate the manifest of agent `slug`. */
export function loadManifest(devdigestDir: string, slug: string, deps: FsDeps = {}): LoadedManifest {
  const readFile = deps.readFile ?? readFileSync;
  const manifestPath = manifestPathFor(devdigestDir, slug);

  let bytes: Buffer;
  try {
    bytes = Buffer.from(readFile(manifestPath) as unknown as Buffer);
  } catch {
    throw new RunnerError(
      `Agent manifest not found: expected .devdigest/agents/${slug}.yaml (looked at ${manifestPath})`,
    );
  }

  let parsed: unknown;
  try {
    parsed = parseYaml(bytes.toString('utf8'));
  } catch (err) {
    throw new RunnerError(
      `Agent manifest at ${manifestPath} is not valid YAML: ${(err as Error).message}`,
    );
  }

  const result = AgentManifest.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('; ');
    throw new RunnerError(`Agent manifest at ${manifestPath} failed validation: ${issues}`);
  }
  return { manifest: result.data, sha256: sha256Hex(bytes), path: manifestPath };
}
