/* AgentPerformanceView — /agent-performance (SPEC-10). Composes the range control, cards, table
   and cost breakdown for one repository. Every request is a GET read of stored data: reload, sort,
   expand and Refresh never start a review or a model call (AC-37). */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useActiveRepo } from "@/lib/repo-context";
import { useAgentPerformance } from "@/lib/hooks/agent-performance";
import type { SortColumn } from "../../_model/constants";
import { rangeKey, rangeLabel, resolveInstants } from "../../_model/range";
import { SummaryCards } from "../SummaryCards";
import { AgentsTable } from "../AgentsTable";
import { CostBreakdown } from "../CostBreakdown";
import { RangeControl } from "./_components/RangeControl";
import { PageEmpty, PageError, PageLoading, ResetNotice } from "./_components/PageStates";
import { usePageAddress } from "./usePageAddress";
import { s } from "./styles";

export function AgentPerformanceView() {
  const t = useTranslations("agentPerformance");
  const format = useFormatter();
  const { repoId: activeRepoId, setRepoId, repos, reposLoaded } = useActiveRepo();

  const repoIds = reposLoaded ? repos.map((r) => r.id) : null;
  const [agentIds, setAgentIds] = React.useState<readonly string[] | null>(null);
  const { address, notice, update } = usePageAddress({
    repoIds,
    activeRepoId,
    agentIds,
    ready: reposLoaded,
    onRepoChange: setRepoId,
  });

  const repo = repos.find((r) => r.id === address.repoId) ?? null;
  const noRepository = reposLoaded && repos.length === 0;
  const query = useAgentPerformance(
    repo?.id,
    rangeKey(address.range),
    () => resolveInstants(address.range, new Date()),
    reposLoaded && !!repo,
  );
  const data = query.data;

  // Listed agents of the loaded overview — an expanded row naming none is reset (AC-64).
  const dataAgentIds = data ? data.rows.map((r) => r.agent_id) : null;
  const dataKey = dataAgentIds ? dataAgentIds.join(",") : null;
  React.useEffect(() => {
    setAgentIds(dataAgentIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  // AC-67: the Most-active card expands its row and scrolls to it.
  const scrollTarget = React.useRef<string | null>(null);
  const scrollToRow = (id: string) => {
    const row = Array.from(document.querySelectorAll<HTMLElement>("[data-agent-id]")).find(
      (el) => el.dataset.agentId === id,
    );
    row?.scrollIntoView?.({ block: "center", behavior: "smooth" });
    row?.querySelector<HTMLElement>("button")?.focus?.({ preventScroll: true });
  };
  React.useEffect(() => {
    const id = scrollTarget.current;
    if (!id || address.expanded !== id || !data) return;
    scrollTarget.current = null;
    scrollToRow(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [address.expanded, data]);

  const onSort = (column: SortColumn) =>
    update(
      address.sort === column
        ? { dir: address.dir === "desc" ? "asc" : "desc" }
        : { sort: column, dir: "desc" },
    );
  const onToggle = (id: string) => update({ expanded: address.expanded === id ? null : id });
  const onOpenMostActive = (id: string) => {
    // Already expanded: the address does not change, so scroll right away — no extra request,
    // and the row is not collapsed (AC-67).
    if (address.expanded === id) {
      scrollToRow(id);
      return;
    }
    scrollTarget.current = id;
    update({ expanded: id });
  };

  const label = rangeLabel(address.range);
  const asOf =
    query.dataUpdatedAt > 0
      ? format.dateTime(new Date(query.dataUpdatedAt), { hour: "2-digit", minute: "2-digit", second: "2-digit" })
      : null;

  let body: React.ReactNode;
  if (noRepository) body = <PageEmpty kind="noRepo" />;
  else if (!reposLoaded || !repo || query.isLoading) body = <PageLoading />;
  else if (query.isError || !data) body = <PageError onRetry={() => void query.refetch()} />;
  else if (data.rows.length === 0 && data.totals.runs === 0) body = <PageEmpty kind="noAgents" />;
  else {
    const noRuns = data.totals.runs === 0;
    body = (
      <>
        <SummaryCards
          totals={data.totals}
          previousPeriod={data.previous_period}
          buckets={data.buckets}
          rangeLabel={label}
          onOpenMostActive={onOpenMostActive}
        />
        {noRuns ? (
          <PageEmpty kind="noRuns" repo={data.repo.full_name} />
        ) : (
          <>
            <AgentsTable
              rows={data.rows}
              sort={address.sort}
              dir={address.dir}
              onSort={onSort}
              expandedId={address.expanded}
              onToggle={onToggle}
              repoId={data.repo.id}
              applied={data.range}
              rangeLabel={label}
            />
            <CostBreakdown overview={data} />
          </>
        )}
      </>
    );
  }

  return (
    <AppShell crumb={[{ label: t("title") }]}>
      <div style={s.page}>
        <div style={s.header}>
          <div>
            <h1 style={s.h1}>{t("title")}</h1>
            <p style={s.subtitle}>{t("subtitle")}</p>
            {repo ? <p style={s.repo}>{t("repository", { name: repo.full_name })}</p> : null}
          </div>
          {noRepository ? null : (
            <div style={s.controls}>
              <RangeControl value={address.range} onChange={(range) => update({ range })} />
              <div style={s.asOfRow}>
                {asOf ? <span>{t("dataAsOf", { time: asOf })}</span> : null}
                <Button
                  size="sm"
                  kind="ghost"
                  icon="RefreshCw"
                  disabled={!repo || query.isFetching}
                  onClick={() => void query.refetch()}
                >
                  {t("refresh")}
                </Button>
              </div>
            </div>
          )}
        </div>
        <ResetNotice parts={notice} />
        {body}
      </div>
    </AppShell>
  );
}
