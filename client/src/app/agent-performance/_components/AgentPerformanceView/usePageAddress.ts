/* usePageAddress — the page's state lives in its address (AC-47, AC-64): repo, range, sort, dir,
   expanded row. Reads are derived from the URL; changes are written back with `router.replace`.
   Invalid parts are replaced by their defaults, the URL is cleaned and a notice remembers what was reset. */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  resolveAddress,
  serializeAddress,
  type PageAddress,
  type ResetPart,
  type ResolvedAddress,
} from "../../_model/address";

export interface UsePageAddressInput {
  /** Workspace repository ids; null while the list is loading. */
  repoIds: readonly string[] | null;
  activeRepoId: string | null;
  /** Listed agent ids of the loaded overview; null while unknown. */
  agentIds: readonly string[] | null;
  /** True once the repositories are known; gates URL cleaning. */
  ready: boolean;
  /** Keep the sidebar repository selector in step with the page's repository (Q-4). */
  onRepoChange: (repoId: string) => void;
}

/** `_` is what the nav substitutes when no repository is active — treat it as absent. */
function withoutPlaceholder(search: URLSearchParams) {
  return {
    get(name: string) {
      const v = search.get(name);
      return name === "repo" && v === "_" ? null : v;
    },
  };
}

export function usePageAddress({ repoIds, activeRepoId, agentIds, ready, onRepoChange }: UsePageAddressInput) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [notice, setNotice] = React.useState<ResetPart[]>([]);

  const params = React.useMemo(() => withoutPlaceholder(new URLSearchParams(search.toString())), [search]);
  const address: ResolvedAddress = resolveAddress(params, {
    repoIds,
    activeRepoId,
    agentIds,
    now: new Date(),
  });
  const canonical = serializeAddress(address);
  const current = search.toString();
  const resetKey = address.resets.join(",");

  // Clean the URL: invalid parts replaced, repo made explicit (AC-47, AC-64).
  React.useEffect(() => {
    if (!ready) return;
    if (resetKey) setNotice((prev) => Array.from(new Set([...prev, ...(resetKey.split(",") as ResetPart[])])));
    if (canonical !== current && (resetKey || !search.get("repo") || search.get("repo") === "_")) {
      router.replace(`${pathname}${canonical ? `?${canonical}` : ""}`, { scroll: false });
    }
  }, [ready, resetKey, canonical, current, pathname, router, search]);

  // Sidebar sync: runs only when the page's repository itself changes.
  const lastSynced = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (!ready || !address.repoId || lastSynced.current === address.repoId) return;
    lastSynced.current = address.repoId;
    if (address.repoId !== activeRepoId) onRepoChange(address.repoId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, address.repoId]);

  const update = React.useCallback(
    (patch: Partial<PageAddress>) => {
      setNotice([]);
      const next: PageAddress = {
        repoId: address.repoId,
        range: address.range,
        sort: address.sort,
        dir: address.dir,
        expanded: address.expanded,
        ...patch,
      };
      const q = serializeAddress(next);
      router.replace(`${pathname}${q ? `?${q}` : ""}`, { scroll: false });
    },
    [address.repoId, address.range, address.sort, address.dir, address.expanded, pathname, router],
  );

  return { address, notice, update };
}
