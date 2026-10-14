import { isDeepStrictEqual } from 'node:util';
import { parse, stringify } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import type { CiFailOn, Provider, ReviewStrategy } from '@devdigest/shared';

/** The saved agent version the manifest is built from (AC-12). */
export interface ManifestAgentInput {
  name: string;
  version: number;
  provider: Provider;
  model: string;
  system_prompt: string;
  strategy: ReviewStrategy;
  ci_fail_on: CiFailOn;
}

/**
 * Build `.devdigest/agents/<slug>.yaml` text. `skillSlugs` are already in
 * skill order. The YAML is parsed back and validated with the shared
 * `AgentManifest`; it must equal the input exactly, so a hostile prompt cannot
 * smuggle extra keys (AC-13). Throws on any mismatch — the caller returns an
 * error instead of files.
 */
export function buildManifestYaml(agent: ManifestAgentInput, skillSlugs: readonly string[]): string {
  const manifest = {
    name: agent.name,
    version: agent.version,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.system_prompt,
    skills: [...skillSlugs],
    strategy: agent.strategy,
    ci_fail_on: agent.ci_fail_on,
  };
  const expected = AgentManifest.parse(manifest);
  const text = stringify(manifest, { lineWidth: 0 });

  let reparsed: unknown;
  try {
    reparsed = parse(text);
  } catch (err) {
    throw new Error(`Generated manifest is not valid YAML: ${(err as Error).message}`);
  }
  const result = AgentManifest.safeParse(reparsed);
  if (!result.success) {
    throw new Error(`Generated manifest failed validation: ${result.error.issues[0]?.message ?? 'invalid'}`);
  }
  if (!isDeepStrictEqual(result.data, expected)) {
    throw new Error('Generated manifest does not round-trip to the agent configuration');
  }
  return text;
}
