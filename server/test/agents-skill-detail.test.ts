import { describe, it, expect } from 'vitest';
import { AgentSkillDetail } from '@devdigest/shared';
import { toAgentSkillDetail } from '../src/modules/agents/helpers.js';
import type { LinkedSkillRow } from '../src/modules/agents/repository.js';

/**
 * `GET /agents/:id/skills` DTO mapping (SPEC project-context-folder, AC-46): the
 * agent's Context tab lists documents attached to its linked skills, so each skill
 * detail must carry `context_docs`. Pure mapping — hermetic, no Docker.
 */

function linkedSkill(
  skill: Partial<LinkedSkillRow['skill']> = {},
  order = 0,
): LinkedSkillRow {
  return {
    order,
    skill: {
      id: '11111111-1111-4111-8111-111111111111',
      workspaceId: '22222222-2222-4222-8222-222222222222',
      name: 'no-then-chains',
      description: 'Prefer async/await.',
      type: 'convention',
      source: 'manual',
      body: '# Rule\nUse async/await.',
      enabled: true,
      version: 3,
      contextDocs: [],
      evidenceFiles: null,
      createdAt: new Date('2026-01-01T00:00:00Z'),
      ...skill,
    },
  };
}

describe('toAgentSkillDetail — context_docs', () => {
  it('exposes the skill’s attached documents, in order', () => {
    const dto = toAgentSkillDetail(
      linkedSkill({ contextDocs: ['docs/a.md', 'specs/b.md'] }),
    );
    expect(dto.context_docs).toEqual(['docs/a.md', 'specs/b.md']);
  });

  it('keeps the stored order rather than sorting', () => {
    const dto = toAgentSkillDetail(
      linkedSkill({ contextDocs: ['z/last.md', 'a/first.md'] }),
    );
    expect(dto.context_docs).toEqual(['z/last.md', 'a/first.md']);
  });

  it.each([null, undefined])('falls back to [] when contextDocs is %s', (value) => {
    const row = linkedSkill();
    (row.skill as { contextDocs: unknown }).contextDocs = value;
    expect(toAgentSkillDetail(row).context_docs).toEqual([]);
  });

  it('produces a payload that satisfies the shared AgentSkillDetail contract', () => {
    const dto = toAgentSkillDetail(
      linkedSkill({ contextDocs: ['docs/a.md', 'specs/b.md'] }, 2),
    );
    const parsed = AgentSkillDetail.parse(dto);
    expect(parsed.context_docs).toEqual(['docs/a.md', 'specs/b.md']);
    expect(parsed.order).toBe(2);
  });
});
