import { LineCounter, parseDocument } from 'yaml';
import type { CiCheckResult, CiRisk } from '@devdigest/shared';

type Json = unknown;
const ALLOWED_PERMISSIONS: Readonly<Record<string, string>> = {
  contents: 'read',
  'pull-requests': 'write',
};

/**
 * Static analysis of a (possibly hand-edited) workflow text for the wizard's
 * Preview/Install gate (AC-23, AC-74). Returns the YAML parse error with its
 * line, or the list of risky constructs. Secret leaks are `secret-scan.ts`.
 */
export function checkWorkflow(text: string): Pick<CiCheckResult, 'yaml_error' | 'risks'> {
  const lineCounter = new LineCounter();
  const doc = parseDocument(text, { prettyErrors: false, lineCounter });
  if (doc.errors.length > 0) {
    const e = doc.errors[0]!;
    return {
      yaml_error: { message: firstLine(e.message), line: lineCounter.linePos(e.pos[0]).line },
      risks: [],
    };
  }
  const root = doc.toJS({ maxAliasCount: 100 }) as Json;
  if (!isRecord(root)) {
    return { yaml_error: { message: 'Workflow must be a YAML mapping', line: 1 }, risks: [] };
  }

  const risks: CiRisk[] = [];
  risks.push(...checkTriggers(root['on'] ?? root['true']));
  const jobs = isRecord(root['jobs']) ? root['jobs'] : {};
  risks.push(...checkPermissions('workflow', root['permissions'], true));
  const jobEntries = Object.entries(jobs);
  for (const [name, job] of jobEntries) {
    if (!isRecord(job)) continue;
    if (job['permissions'] !== undefined) {
      risks.push(...checkPermissions(`job "${name}"`, job['permissions'], false));
    } else if (root['permissions'] === undefined) {
      risks.push({
        kind: 'permission',
        detail: `Job "${name}" declares no permissions, so it inherits the repository default token permissions`,
        risk: true,
      });
    }
    if (!hasForkGate(job['if'])) {
      risks.push({
        kind: 'fork_skip',
        detail: `Job "${name}" has no skip for pull requests from forks, so fork code could reach OPENROUTER_API_KEY`,
        risk: true,
      });
    }
  }
  if (jobEntries.length === 0) {
    risks.push({ kind: 'fork_skip', detail: 'Workflow has no jobs, so no fork skip is present', risk: true });
  }
  return { yaml_error: null, risks };
}

/** True when at least one finding needs the user's "I understand the risk" tick. */
export function hasRisks(r: Pick<CiCheckResult, 'risks'>): boolean {
  return r.risks.some((x) => x.risk);
}

function checkTriggers(on: Json): CiRisk[] {
  let names: string[] = [];
  if (typeof on === 'string') names = [on];
  else if (Array.isArray(on)) names = on.filter((x): x is string => typeof x === 'string');
  else if (isRecord(on)) names = Object.keys(on);
  else
    return [{ kind: 'trigger', detail: 'Workflow has no readable "on" trigger', risk: true }];
  const risks: CiRisk[] = [];
  for (const n of names) {
    if (n !== 'pull_request') {
      risks.push({ kind: 'trigger', detail: `Trigger "${n}" is not pull_request`, risk: true });
    }
  }
  if (!names.includes('pull_request')) {
    risks.push({ kind: 'trigger', detail: 'Workflow does not trigger on pull_request', risk: true });
  }
  return risks;
}

function checkPermissions(scope: string, perms: Json, _workflowLevel: boolean): CiRisk[] {
  if (perms === undefined) return [];
  if (typeof perms === 'string') {
    return [
      {
        kind: 'permission',
        detail: `${scope}: permissions "${perms}" grant more than contents: read and pull-requests: write`,
        risk: true,
      },
    ];
  }
  if (!isRecord(perms)) {
    return [{ kind: 'permission', detail: `${scope}: permissions are not a mapping`, risk: true }];
  }
  const risks: CiRisk[] = [];
  for (const [k, v] of Object.entries(perms)) {
    if (v === 'none') continue;
    const allowed = ALLOWED_PERMISSIONS[k];
    // `pull-requests: read` is narrower than the allowance, so it is fine.
    const withinAllowance = allowed !== undefined && (v === allowed || (k === 'pull-requests' && v === 'read'));
    if (!withinAllowance) {
      risks.push({
        kind: 'permission',
        detail: `${scope}: permission "${k}: ${String(v)}" is beyond contents: read and pull-requests: write`,
        risk: true,
      });
    }
  }
  return risks;
}

function hasForkGate(cond: Json): boolean {
  if (typeof cond !== 'string') return false;
  if (cond.includes('||')) return false; // an OR can bypass the gate
  const c = cond.replace(/\$\{\{|\}\}/g, ' ').replace(/\s+/g, ' ').trim();
  return (
    /github\.event\.pull_request\.head\.repo\.full_name\s*==\s*github\.repository\b/.test(c) ||
    /github\.event\.pull_request\.head\.repo\.fork\s*==\s*false\b/.test(c) ||
    /^!\s*github\.event\.pull_request\.head\.repo\.fork$/.test(c)
  );
}

function isRecord(v: Json): v is Record<string, Json> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function firstLine(s: string): string {
  return s.split('\n')[0]!.trim();
}
