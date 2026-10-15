/* Page address state (AC-47, AC-64): parse → validate → defaults + a list of reset parts. */
import {
  DEFAULT_DIR,
  DEFAULT_RANGE_KIND,
  DEFAULT_SORT,
  RANGE_KINDS,
  SORT_COLUMNS,
  SORT_DIRS,
  type RangeKind,
  type SortColumn,
  type SortDir,
} from "./constants";
import { validateCustomRange, type RangeSelection } from "./range";

export type ResetPart = "repo" | "range" | "sort" | "dir" | "expanded";

export interface PageAddress {
  repoId: string | null;
  range: RangeSelection;
  sort: SortColumn;
  dir: SortDir;
  expanded: string | null;
}

export interface ResolvedAddress extends PageAddress {
  /** Parts of the address that were invalid and replaced by their default. */
  resets: ResetPart[];
}

export interface ResolveContext {
  /** Workspace repository ids; null while the list is loading (nothing is judged yet). */
  repoIds: readonly string[] | null;
  activeRepoId: string | null;
  /** Listed agent ids of the loaded overview; null while unknown (nothing is judged yet). */
  agentIds: readonly string[] | null;
  now: Date;
}

interface ParamsLike {
  get(name: string): string | null;
}

function oneOf<T extends string>(list: readonly T[], value: string | null): T | null {
  return value != null && (list as readonly string[]).includes(value) ? (value as T) : null;
}

export function resolveAddress(params: ParamsLike, ctx: ResolveContext): ResolvedAddress {
  const resets: ResetPart[] = [];

  // repository
  const repoParam = params.get("repo");
  let repoId = repoParam || ctx.activeRepoId;
  if (repoParam && ctx.repoIds && !ctx.repoIds.includes(repoParam)) {
    resets.push("repo");
    repoId = ctx.activeRepoId;
  }

  // range
  let range: RangeSelection = { kind: DEFAULT_RANGE_KIND };
  const rangeParam = params.get("range");
  if (rangeParam != null) {
    const kind = oneOf<RangeKind>(RANGE_KINDS, rangeParam);
    if (!kind) {
      resets.push("range");
    } else if (kind === "custom") {
      const start = params.get("start");
      const end = params.get("end");
      if (validateCustomRange(start, end, ctx.now) == null) {
        range = { kind, start: start!, end: end! };
      } else {
        resets.push("range");
      }
    } else {
      range = { kind };
    }
  }

  // sort
  let sort: SortColumn = DEFAULT_SORT;
  const sortParam = params.get("sort");
  if (sortParam != null) {
    const col = oneOf<SortColumn>(SORT_COLUMNS, sortParam);
    if (col) sort = col;
    else resets.push("sort");
  }
  let dir: SortDir = DEFAULT_DIR;
  const dirParam = params.get("dir");
  if (dirParam != null) {
    const d = oneOf<SortDir>(SORT_DIRS, dirParam);
    if (d) dir = d;
    else resets.push("dir");
  }

  // expanded row
  let expanded: string | null = params.get("expanded") || null;
  if (expanded && ctx.agentIds && !ctx.agentIds.includes(expanded)) {
    resets.push("expanded");
    expanded = null;
  }

  return { repoId: repoId ?? null, range, sort, dir, expanded, resets };
}

/** Query string for an address; defaults are omitted, `repo` is kept when known. */
export function serializeAddress(address: PageAddress): string {
  const q = new URLSearchParams();
  if (address.repoId) q.set("repo", address.repoId);
  if (address.range.kind !== DEFAULT_RANGE_KIND) {
    q.set("range", address.range.kind);
    if (address.range.kind === "custom") {
      q.set("start", address.range.start ?? "");
      q.set("end", address.range.end ?? "");
    }
  }
  if (address.sort !== DEFAULT_SORT) q.set("sort", address.sort);
  if (address.dir !== DEFAULT_DIR) q.set("dir", address.dir);
  if (address.expanded) q.set("expanded", address.expanded);
  return q.toString();
}
