import { NotFoundError } from '../../platform/errors.js';
import type { AgentPerformanceDetail, AgentPerformanceOverview, AgentPerformanceQuery } from '@devdigest/shared';
import { buildDetail, buildOverview } from './aggregate.js';
import { COUNTED_STATUSES } from './constants.js';
import type { AgentPerformanceDeps, TimeRange } from './types.js';

/**
 * Agent Performance reads (SPEC-10). Strictly read-only: the only dependency is the
 * repository — no price book, model, GitHub or network (AC-25).
 */
export class AgentPerformanceService {
  constructor(private deps: AgentPerformanceDeps) {}

  async getOverview(workspaceId: string, query: AgentPerformanceQuery): Promise<AgentPerformanceOverview> {
    const { repo: port } = this.deps;
    const repo = await port.getRepo(workspaceId, query.repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    const range = toRange(query);
    const [agents, runs, previousRuns, decisions, lastRuns] = await Promise.all([
      port.listAgents(workspaceId),
      port.listRunFacts(workspaceId, repo, range),
      port.listRunFacts(workspaceId, repo, previousRange(range)),
      port.decisionCounts(workspaceId, repo, range),
      port.lastRuns(workspaceId, repo, COUNTED_STATUSES),
    ]);
    return buildOverview({ repo, range, agents, runs, previousRuns, decisions, lastRuns });
  }

  async getAgentDetail(
    workspaceId: string,
    agentId: string,
    query: AgentPerformanceQuery,
  ): Promise<AgentPerformanceDetail> {
    const { repo: port } = this.deps;
    const agent = await port.getAgent(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await port.getRepo(workspaceId, query.repoId);
    if (!repo) throw new NotFoundError('Repository not found');

    const range = toRange(query);
    const [runs, decisions, lastRuns] = await Promise.all([
      port.listRunFacts(workspaceId, repo, range, agentId),
      port.decisionCounts(workspaceId, repo, range, agentId),
      port.lastRuns(workspaceId, repo, COUNTED_STATUSES, agentId),
    ]);
    const lastRunAt = lastRuns.find((l) => l.agentId === agentId)?.at ?? null;
    return buildDetail({ repo, range, agent, runs, decisions, lastRunAt });
  }
}

const toRange = (q: AgentPerformanceQuery): TimeRange => ({ from: new Date(q.from), to: new Date(q.to) });

/** `[from − (to − from), from)` (AC-57). */
const previousRange = (r: TimeRange): TimeRange => ({
  from: new Date(r.from.getTime() - (r.to.getTime() - r.from.getTime())),
  to: r.from,
});
