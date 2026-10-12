import { describe, it, expect } from 'vitest';
import { AgentManifest, CiResultArtifact, ciArtifactName } from '@devdigest/shared';

/**
 * T-6 — Export-to-CI shared contracts (AC-13, AC-63, EC-36): the manifest the
 * studio writes and the runner reads, and the result artifact the ingest parses.
 */
describe('AgentManifest', () => {
  const base = { name: 'Reviewer', model: 'm', system_prompt: 'p' };

  it('requires the saved agent version (AC-12/AC-13)', () => {
    expect(AgentManifest.safeParse(base).success).toBe(false);
    expect(AgentManifest.safeParse({ ...base, version: 0 }).success).toBe(false);
    const ok = AgentManifest.parse({ ...base, version: 3 });
    expect(ok).toMatchObject({ version: 3, skills: [], strategy: 'auto', ci_fail_on: 'critical' });
  });
});

describe('CiResultArtifact', () => {
  it('still parses a result from an older runner bundle without the new fields (EC-36)', () => {
    const old = { findings_count: 2, cost_usd: null, agent: 'Reviewer' };
    const parsed = CiResultArtifact.safeParse(old);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.verdict ?? null).toBeNull();
      expect(parsed.data.trace ?? null).toBeNull();
    }
  });

  it('rejects a result without the agent name', () => {
    expect(CiResultArtifact.safeParse({ findings_count: 0, cost_usd: 0 }).success).toBe(false);
  });
});

describe('ciArtifactName', () => {
  it('includes the slug and the run attempt so a re-run does not collide', () => {
    expect(ciArtifactName('my-agent', 1)).toBe('devdigest-result-my-agent-1');
    expect(ciArtifactName('my-agent', 2)).not.toBe(ciArtifactName('my-agent', 1));
  });
});
