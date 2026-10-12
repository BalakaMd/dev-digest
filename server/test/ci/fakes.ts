import type { CiInstallationStatus, CiRunDetail, CiRunItem } from '@devdigest/shared';
import { MockGitHubClient, MockRunnerBundle } from '../../src/adapters/mocks.js';
import { CiService } from '../../src/modules/ci/service.js';
import type {
  CiAgent,
  CiInstallationRecord,
  CiLogger,
  CiRepositoryPort,
  CiRunsSlice,
  CiSkill,
  InsertCiRunInput,
  ListCiRunsQuery,
  UpsertInstallationInput,
} from '../../src/modules/ci/types.js';

/** Shared test doubles of the ci module: an in-memory repository, agents and a service factory. */

export const WORKSPACE = 'ws-1';
export const REPO = 'acme/web';
export const NOW = new Date('2026-03-01T12:00:00.000Z');
/** Assembled at run time so no key-like literal sits in a test file. */
export const FAKE_TOKEN = `ghp_${'F4k3T0k3n9'.repeat(4)}`;

export const makeAgent = (over: Partial<CiAgent> = {}): CiAgent => ({
  id: 'agent-1',
  name: 'Security Reviewer',
  provider: 'openrouter',
  model: 'anthropic/claude-sonnet',
  systemPrompt: 'Review the diff for security issues.',
  strategy: 'auto',
  ciFailOn: 'critical',
  version: 3,
  contextDocsCount: 0,
  ...over,
});

export class FakeCiRepo implements CiRepositoryPort {
  installations: CiInstallationRecord[] = [];
  runs: Array<InsertCiRunInput & { id: string }> = [];
  imported = new Set<string>([REPO]);
  touched: Array<{ id: string; at: Date }> = [];
  upsertCalls = 0;
  private seq = 0;

  async isImportedRepo(_ws: string, fullName: string) {
    return this.imported.has(fullName);
  }
  async getInstallation(_ws: string, agentId: string, repo: string) {
    return this.installations.find((i) => i.agentId === agentId && i.repo === repo);
  }
  async getInstallationById(_ws: string, id: string) {
    return this.installations.find((i) => i.id === id);
  }
  async listInstallations() {
    return [...this.installations];
  }
  async listInstallationsForAgent(_ws: string, agentId: string) {
    return this.installations.filter((i) => i.agentId === agentId);
  }
  async listInstallationsForRepo(_ws: string, repo: string) {
    return this.installations.filter((i) => i.repo === repo);
  }
  async upsertInstallation(_ws: string, input: UpsertInstallationInput) {
    this.upsertCalls++;
    const existing = this.installations.find((i) => i.agentId === input.agentId && i.repo === input.repo);
    const { now, ...fields } = input;
    if (existing) {
      const statusChangedAt = existing.status === input.status ? existing.statusChangedAt : now;
      Object.assign(existing, fields, { statusChangedAt });
      return existing;
    }
    const rec: CiInstallationRecord = {
      id: `inst-${++this.seq}`,
      targetType: 'gha',
      installedAt: now,
      statusChangedAt: now,
      lastCollectedAt: null,
      ...fields,
    };
    this.installations.push(rec);
    return rec;
  }
  async updateStatus(_ws: string, id: string, status: CiInstallationStatus, now: Date) {
    const i = this.installations.find((x) => x.id === id);
    if (i && i.status !== status) Object.assign(i, { status, statusChangedAt: now });
  }
  async touchCollected(_ws: string, id: string, at: Date) {
    this.touched.push({ id, at });
    const i = this.installations.find((x) => x.id === id);
    if (i) i.lastCollectedAt = at;
  }
  async insertCiRun(_ws: string, input: InsertCiRunInput) {
    if (await this.ciRunExists(_ws, input.repo, input.actionsRunId, input.actionsRunAttempt)) return false;
    this.runs.push({ ...input, id: `run-${++this.seq}` });
    return true;
  }
  async ciRunExists(_ws: string, repo: string, runId: string, attempt: number) {
    return this.runs.some((r) => r.repo === repo && r.actionsRunId === runId && r.actionsRunAttempt === attempt);
  }
  async listCiRuns(_ws: string, _q: ListCiRunsQuery): Promise<CiRunsSlice> {
    return { items: [], next: null };
  }
  async getCiRun(): Promise<CiRunDetail | undefined> {
    return undefined;
  }
  async latestRunByInstallation(): Promise<Map<string, CiRunItem>> {
    return new Map();
  }
}

export interface LogLine {
  level: 'info' | 'warn';
  obj: Record<string, unknown>;
  msg: string;
}

export function makeLogger(): CiLogger & { lines: LogLine[] } {
  const lines: LogLine[] = [];
  return {
    lines,
    info: (obj, msg) => void lines.push({ level: 'info', obj, msg }),
    warn: (obj, msg) => void lines.push({ level: 'warn', obj, msg }),
  };
}

export interface ServiceFixture {
  service: CiService;
  repo: FakeCiRepo;
  github: MockGitHubClient;
  bundle: MockRunnerBundle;
  githubCalls: { n: number };
  /** Mutate to change what the service sees as the saved agent. */
  agents: Map<string, CiAgent>;
  skills: Map<string, CiSkill[]>;
}

export function makeServiceFixture(
  opts: {
    agent?: CiAgent;
    skills?: CiSkill[];
    github?: MockGitHubClient;
    secrets?: string[];
    bundle?: MockRunnerBundle;
  } = {},
): ServiceFixture {
  const repo = new FakeCiRepo();
  const github = opts.github ?? new MockGitHubClient();
  const bundle = opts.bundle ?? new MockRunnerBundle();
  const agent = opts.agent ?? makeAgent();
  const agents = new Map<string, CiAgent>([[agent.id, agent]]);
  const skills = new Map<string, CiSkill[]>([[agent.id, opts.skills ?? []]]);
  const secretSet = new Set(opts.secrets ?? ['GITHUB_TOKEN']);
  const githubCalls = { n: 0 };
  const service = new CiService({
    repo,
    agents: {
      getById: async (_ws, id) => agents.get(id),
      linkedSkills: async (id) => skills.get(id) ?? [],
    },
    secrets: { has: async (name) => secretSet.has(name) },
    github: async () => {
      githubCalls.n++;
      return github;
    },
    bundle,
    now: () => NOW,
  });
  return { service, repo, github, bundle, githubCalls, agents, skills };
}

export const previewInput = {
  repo: REPO,
  triggers: ['opened', 'synchronize'] as Array<'opened' | 'synchronize' | 'reopened'>,
  post_as: 'github_review' as const,
};
