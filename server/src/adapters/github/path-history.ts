import type { PathPull, PathPullHistory } from '@devdigest/shared';

/** GraphQL cost guard: how many `history(path:)` aliases go into one query. */
export const PATH_ALIASES_PER_QUERY = 25;

/**
 * Build one query with an aliased `history(path: $pN)` per path. Paths are
 * passed ONLY as GraphQL variables (`$p0..$p{count-1}`), never interpolated
 * into the query text.
 */
export function buildPathHistoryQuery(count: number): string {
  const vars = Array.from({ length: count }, (_, i) => `$p${i}: String!`).join(', ');
  const aliases = Array.from(
    { length: count },
    (_, i) =>
      `h${i}: history(path: $p${i}, first: $n) { nodes { associatedPullRequests(first: $m) { nodes { number title mergedAt changedFiles author { login } } } } }`,
  ).join(' ');
  return `query($owner: String!, $name: String!, $ref: String!, $n: Int!, $m: Int!${vars ? `, ${vars}` : ''}) { repository(owner: $owner, name: $name) { object(expression: $ref) { ... on Commit { ${aliases} } } } }`;
}

interface RawPull {
  number?: number;
  title?: string;
  mergedAt?: string | null;
  changedFiles?: number;
  author?: { login?: string } | null;
}

/** Map a GraphQL response to port types; tolerates missing nodes. */
export function parsePathHistory(data: unknown, paths: string[]): PathPullHistory {
  const object = (data as { repository?: { object?: Record<string, unknown> | null } } | null)
    ?.repository?.object;
  if (!object) {
    return { refFound: false, paths: paths.map((path) => ({ path, pulls: [] })) };
  }
  return {
    refFound: true,
    paths: paths.map((path, i) => {
      const commits =
        (object[`h${i}`] as { nodes?: { associatedPullRequests?: { nodes?: RawPull[] } }[] } | null)
          ?.nodes ?? [];
      const pulls: PathPull[] = [];
      for (const c of commits) {
        for (const p of c?.associatedPullRequests?.nodes ?? []) {
          if (!p || typeof p.number !== 'number') continue;
          pulls.push({
            number: p.number,
            title: p.title ?? '',
            mergedAt: p.mergedAt ?? null,
            author: p.author?.login ?? 'unknown',
            changedFiles: p.changedFiles ?? 0,
          });
        }
      }
      return { path, pulls };
    }),
  };
}
