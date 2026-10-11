import type {
  DiffLine,
  EvalCompare,
  EvalCompareCaseRef,
  EvalCompareConfigDiff,
  EvalCompareFlipped,
  EvalCompareMetric,
  EvalSuiteRun,
} from '@devdigest/shared';
import { scoreRun } from './scoring.js';
import type { CompareCaseRow, ConfigSnapshot } from './types.js';

/** Pure compare of two suite runs of one agent (SPEC-06, AC-31/32/33/41/45/76). No IO. */

export interface CompareRunInput {
  run: EvalSuiteRun;
  cases: CompareCaseRow[];
}

const round = (n: number, digits: number): number => Number(n.toFixed(digits));

/** Signed difference in percentage points; `null` when either side has no value. */
function metric(older: number | null, newer: number | null): EvalCompareMetric {
  return {
    older,
    newer,
    delta_pp: older === null || newer === null ? null : round((newer - older) * 100, 6),
  };
}

function ref(c: CompareCaseRow): EvalCompareCaseRef {
  return { case_id: c.case_id, case_name: c.case_name, expectation_types: c.expectation_types };
}

/**
 * Compare `older` with `newer`. Metrics, deltas and flips are recomputed over the cases
 * scored (non-error) in BOTH runs, matched by `case_id` (AC-33). A case present in only
 * one run, or whose row lost its `case_id` (deleted case), is listed as "only in" that run.
 * Cost is each run's own total (AC-45); `null` = unknown, never 0 (AC-76).
 */
export function compareRuns(
  older: CompareRunInput,
  newer: CompareRunInput,
  configDiff: EvalCompareConfigDiff,
): EvalCompare {
  const byId = (rows: CompareCaseRow[]) => {
    const m = new Map<string, CompareCaseRow>();
    for (const r of rows) if (r.case_id !== null && !m.has(r.case_id)) m.set(r.case_id, r);
    return m;
  };
  const olderById = byId(older.cases);
  const newerById = byId(newer.cases);

  const onlyOlder = older.cases.filter((r) => r.case_id === null || !newerById.has(r.case_id));
  const onlyNewer = newer.cases.filter((r) => r.case_id === null || !olderById.has(r.case_id));

  const sharedOlder: CompareCaseRow[] = [];
  const sharedNewer: CompareCaseRow[] = [];
  const flipped: EvalCompareFlipped[] = [];
  for (const n of newer.cases) {
    if (n.case_id === null) continue;
    const o = olderById.get(n.case_id);
    if (!o || o.status !== 'ok' || n.status !== 'ok') continue;
    sharedOlder.push(o);
    sharedNewer.push(n);
    if (!!o.passed !== !!n.passed) {
      flipped.push({ ...ref(n), from: o.passed ? 'passed' : 'failed', to: n.passed ? 'passed' : 'failed' });
    }
  }

  const so = scoreRun(sharedOlder);
  const sn = scoreRun(sharedNewer);

  return {
    older: older.run,
    newer: newer.run,
    recall: metric(so.recall, sn.recall),
    precision: metric(so.precision, sn.precision),
    citation_accuracy: metric(so.citation_accuracy, sn.citation_accuracy),
    cost: {
      older: older.run.cost_usd,
      newer: newer.run.cost_usd,
      delta:
        older.run.cost_usd === null || newer.run.cost_usd === null
          ? null
          : round(newer.run.cost_usd - older.run.cost_usd, 9),
    },
    shared_case_count: sharedNewer.length,
    only_in_older: onlyOlder.map(ref),
    only_in_newer: onlyNewer.map(ref),
    flipped,
    errored: {
      older: older.cases.filter((c) => c.status === 'error').length,
      newer: newer.cases.filter((c) => c.status === 'error').length,
    },
    config_diff: configDiff,
  };
}

// ------------------------------------------------------------------ config diff

/** Line diff (LCS) of two texts; common prefix/suffix are trimmed first. */
export function diffLines(older: string, newer: string): DiffLine[] {
  const a = older === '' ? [] : older.split('\n');
  const b = newer === '' ? [] : newer.split('\n');
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start += 1;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) {
    endA -= 1;
    endB -= 1;
  }
  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  // lcs[i][j] = LCS length of midA[i..] and midB[j..]
  const w = m + 1;
  const lcs = new Uint32Array((n + 1) * w);
  for (let i = n - 1; i >= 0; i -= 1) {
    for (let j = m - 1; j >= 0; j -= 1) {
      lcs[i * w + j] =
        midA[i] === midB[j]
          ? lcs[(i + 1) * w + j + 1]! + 1
          : Math.max(lcs[(i + 1) * w + j]!, lcs[i * w + j + 1]!);
    }
  }
  const out: DiffLine[] = a.slice(0, start).map((text) => ({ kind: 'same', text }));
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (midA[i] === midB[j]) {
      out.push({ kind: 'same', text: midA[i]! });
      i += 1;
      j += 1;
    } else if (lcs[(i + 1) * w + j]! >= lcs[i * w + j + 1]!) {
      out.push({ kind: 'del', text: midA[i]! });
      i += 1;
    } else {
      out.push({ kind: 'add', text: midB[j]! });
      j += 1;
    }
  }
  for (; i < n; i += 1) out.push({ kind: 'del', text: midA[i]! });
  for (; j < m; j += 1) out.push({ kind: 'add', text: midB[j]! });
  for (const text of a.slice(endA)) out.push({ kind: 'same', text });
  return out;
}

/**
 * AC-32: difference between two agent config snapshots. Skills are reported by display
 * name (`skillNames` maps id -> name, the id itself when unknown). `reordered` = the skills
 * present in both are linked in a different order.
 */
export function diffConfigs(
  older: ConfigSnapshot,
  newer: ConfigSnapshot,
  skillNames: ReadonlyMap<string, string> | Record<string, string> = {},
): EvalCompareConfigDiff {
  const nameOf = (id: string) =>
    (skillNames instanceof Map ? skillNames.get(id) : (skillNames as Record<string, string>)[id]) ?? id;
  const oldSet = new Set(older.skills);
  const newSet = new Set(newer.skills);
  const commonOld = older.skills.filter((id) => newSet.has(id));
  const commonNew = newer.skills.filter((id) => oldSet.has(id));
  return {
    system_prompt: diffLines(older.system_prompt, newer.system_prompt),
    provider: older.provider === newer.provider ? null : { older: older.provider, newer: newer.provider },
    model: older.model === newer.model ? null : { older: older.model, newer: newer.model },
    skills: {
      added: newer.skills.filter((id) => !oldSet.has(id)).map(nameOf),
      removed: older.skills.filter((id) => !newSet.has(id)).map(nameOf),
      reordered: commonOld.some((id, i) => id !== commonNew[i]),
    },
  };
}
