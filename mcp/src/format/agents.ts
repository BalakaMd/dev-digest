import type { Agent } from '@devdigest/shared';

export interface AgentsProjection {
  name: string;
  enabled: boolean;
  provider: string;
  model: string;
  description: string;
  id?: string;
  strategy?: string;
  ciFailOn?: string;
  repoIntel?: boolean;
  version?: number;
}

/** Never `system_prompt` — see `devdigest_list_agents`'s contract. */
export function projectAgents(agents: Agent[], detailed: boolean): AgentsProjection[] {
  return agents.map((a) => {
    const base: AgentsProjection = {
      name: a.name,
      enabled: a.enabled,
      provider: a.provider,
      model: a.model,
      description: a.description.length > 100 ? `${a.description.slice(0, 100)}…` : a.description,
    };
    if (!detailed) return base;
    return {
      ...base,
      id: a.id,
      strategy: a.strategy,
      ciFailOn: a.ci_fail_on,
      repoIntel: a.repo_intel,
      version: a.version,
    };
  });
}

export function renderAgentsText(agents: Agent[], detailed: boolean): string {
  if (agents.length === 0) return 'No agents are configured yet — add one in the studio (Agents).';
  const projected = projectAgents(agents, false);
  const lines = projected.map((a, i) => {
    const skillCount = agents[i]!.skill_count ?? 0;
    return `${a.name} — ${a.provider}/${a.model} · ${a.enabled ? 'enabled' : 'disabled'} · ${skillCount} skill(s) · ${a.description}`;
  });
  if (detailed) {
    return agents
      .map(
        (a) =>
          `${a.name} (${a.id}) — ${a.provider}/${a.model} · ${a.enabled ? 'enabled' : 'disabled'} · strategy=${a.strategy} · ci_fail_on=${a.ci_fail_on} · repo_intel=${a.repo_intel} · v${a.version}`,
      )
      .join('\n');
  }
  return lines.join('\n');
}
