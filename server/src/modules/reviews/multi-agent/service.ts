import type {
  LatestMultiAgentRun,
  MultiAgentRun,
  ReviewEstimates,
} from '@devdigest/shared';
import { AppError, NotFoundError } from '../../../platform/errors.js';
import type { RunBus } from '../../../platform/sse.js';
import type { AgentRow } from '../../../db/rows.js';
import type { ReviewRepository } from '../repository.js';
import type { Logger, ReviewRunExecutor } from '../run-executor.js';
import { summariseEstimate, toAgentEstimate } from './estimate.js';
import { buildMultiAgentRun } from './view.js';

export interface MultiAgentDeps {
  repo: ReviewRepository;
  agents: { list(workspaceId: string): Promise<AgentRow[]> };
  runBus: Pick<RunBus, 'buffer'>;
  executor: Pick<ReviewRunExecutor, 'executeRuns'>;
}

export interface MultiAgentTriggerResult {
  runs: { run_id: string; agent_id: string; agent_name: string }[];
  reviews: [];
  multi_agent_run_id: string;
}

/** Multi-agent review: trigger a batch by agent set and read the aggregate. */
export class MultiAgentService {
  constructor(private deps: MultiAgentDeps) {}

  async trigger(
    workspaceId: string,
    prId: string,
    agentIds: string[],
    logger?: Logger,
  ): Promise<MultiAgentTriggerResult> {
    const { repo, agents, executor } = this.deps;

    // (1) dedupe, order preserved
    const ids = [...new Set(agentIds)];
    // (2) validate everything before any write
    if (ids.length === 0) {
      throw new AppError('invalid_run_request', 'Select at least one agent', 400);
    }
    const known = new Map((await agents.list(workspaceId)).map((a) => [a.id, a]));
    const targets: AgentRow[] = [];
    for (const id of ids) {
      const agent = known.get(id);
      if (!agent) throw new AppError('invalid_run_request', 'Unknown agent in agentIds', 400);
      if (!agent.enabled) {
        throw new AppError('invalid_run_request', `Agent "${agent.name}" is disabled`, 400);
      }
      targets.push(agent);
    }

    // (3) PR / repo lookup
    const pull = await repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const repoRow = await repo.getRepo(pull.repoId);
    if (!repoRow) throw new NotFoundError('Repo not found');

    // (4) recorded estimate
    const estimate = summariseEstimate(await this.agentEstimates(workspaceId, ids), ids);

    // (5) one transaction: record + N running runs
    const created = await repo.createMultiAgentRun({
      workspaceId,
      prId,
      estimate,
      targets: targets.map((a) => ({ agentId: a.id, provider: a.provider, model: a.model })),
    });

    // (6) fire-and-forget; agent rows were read above, so later edits do not
    // change this batch.
    const jobs = targets.map((agent, i) => ({ agent, runId: created.runIds[i]! }));
    void executor.executeRuns(workspaceId, pull, repoRow, jobs, logger).catch((err) => {
      logger?.error(
        { prId, multiAgentRunId: created.id, err: (err as Error).message },
        'multi-agent review: background execution crashed',
      );
    });

    // (7)
    return {
      runs: jobs.map((j) => ({ run_id: j.runId, agent_id: j.agent.id, agent_name: j.agent.name })),
      reviews: [],
      multi_agent_run_id: created.id,
    };
  }

  async get(workspaceId: string, id: string): Promise<MultiAgentRun> {
    const record = await this.deps.repo.getMultiAgentRun(workspaceId, id);
    if (!record) throw new NotFoundError('Multi-agent run not found');
    const entries = await this.deps.repo.listMultiAgentEntries(workspaceId, id);
    const latestLogs = new Map<string, string | null>();
    for (const e of entries) {
      if (e.status === 'running') {
        latestLogs.set(e.runId, this.deps.runBus.buffer(e.runId).at(-1)?.msg ?? null);
      }
    }
    return buildMultiAgentRun(record, entries, latestLogs);
  }

  async latestForPull(workspaceId: string, prId: string): Promise<LatestMultiAgentRun> {
    const pull = await this.deps.repo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');
    const latest = await this.deps.repo.latestMultiAgentRunForPull(workspaceId, prId);
    return { latest: latest ? { id: latest.id, ran_at: latest.ranAt.toISOString() } : null };
  }

  async estimates(workspaceId: string): Promise<ReviewEstimates> {
    const all = await this.deps.agents.list(workspaceId);
    return { estimates: await this.agentEstimates(workspaceId, all.map((a) => a.id)) };
  }

  private async agentEstimates(workspaceId: string, agentIds: string[]) {
    const samples = await this.deps.repo.estimateSamples(workspaceId, agentIds);
    return samples.map((s) =>
      toAgentEstimate({ agent_id: s.agentId, durations: s.durations, costs: s.costs }),
    );
  }
}
