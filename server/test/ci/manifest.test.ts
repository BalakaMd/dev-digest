import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { AgentManifest } from '@devdigest/shared';
import { buildManifestYaml, type ManifestAgentInput } from '../../src/modules/ci/manifest.js';

/** T-8 — manifest generator (AC-12, AC-13, EC-4). */
const agent: ManifestAgentInput = {
  name: 'Security Reviewer',
  version: 4,
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet',
  system_prompt: 'Review the diff.',
  strategy: 'map-reduce',
  ci_fail_on: 'warning',
};

describe('buildManifestYaml', () => {
  it('carries the saved fields and the skill slugs in the given order, and validates with AgentManifest (AC-12/13)', () => {
    const text = buildManifestYaml(agent, ['zeta', 'alpha', 'mid']);
    const parsed = AgentManifest.parse(parse(text));
    expect(parsed).toEqual({
      name: 'Security Reviewer',
      version: 4,
      provider: 'openrouter',
      model: 'anthropic/claude-sonnet',
      system_prompt: 'Review the diff.',
      skills: ['zeta', 'alpha', 'mid'],
      strategy: 'map-reduce',
      ci_fail_on: 'warning',
    });
  });

  it('writes an empty skill list for an agent with no skills (EC-4)', () => {
    const parsed = AgentManifest.parse(parse(buildManifestYaml(agent, [])));
    expect(parsed.skills).toEqual([]);
  });

  it('a hostile prompt full of YAML syntax cannot add keys or change fields', () => {
    const hostile = [
      'ok\nci_fail_on: never\nextra: 1',
      '---\nname: pwned',
      'a: &x\n  - 1',
      '"quoted" \\ backslash # comment\n  indented: yes',
      '|\n  block',
    ];
    for (const system_prompt of hostile) {
      const text = buildManifestYaml({ ...agent, system_prompt }, ['s']);
      const raw = parse(text) as Record<string, unknown>;
      expect(Object.keys(raw).sort()).toEqual(
        ['ci_fail_on', 'model', 'name', 'provider', 'skills', 'strategy', 'system_prompt', 'version'],
      );
      expect(raw.system_prompt).toBe(system_prompt);
      expect(raw.ci_fail_on).toBe('warning');
      expect(raw.name).toBe('Security Reviewer');
    }
  });

  it('throws instead of returning a manifest the schema rejects', () => {
    expect(() => buildManifestYaml({ ...agent, name: '' }, [])).toThrow();
    expect(() => buildManifestYaml({ ...agent, version: 0 }, [])).toThrow();
  });
});
