/* ResultsView — /multi-agent-review/[id]. One multi-agent run in Columns or Tabs
   mode (`?view=`, default columns), the disagreement block, and the shared run
   trace drawer. Status comes from the API and is polled by useMultiAgentRun, so
   a reload or a return shows the current state. All API text is rendered as text. */
"use client";

import React from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { AppShell } from "@/components/app-shell";
import { RunTraceDrawer } from "@/components/run-trace-drawer";
import { ApiError } from "@/lib/api";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent-review";
import { useCancelRun, useFindingAction } from "@/lib/hooks/reviews";
import { useActiveRepo } from "@/lib/repo-context";
import { ColumnsView } from "../../../_components/ColumnsView";
import { TabsView } from "../../../_components/TabsView";
import { DisagreeBlock } from "../../../_components/DisagreeBlock";
import type { ViewMode } from "../ViewToggle";
import { RunHeader } from "./RunHeader";
import { s } from "./styles";

export function ResultsView({ id }: { id: string }) {
  const t = useTranslations("multiAgentResults");
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const qc = useQueryClient();
  const { setRepoId } = useActiveRepo();
  const { data: run, error } = useMultiAgentRun(id);
  const cancel = useCancelRun();
  const action = useFindingAction();
  const [traceRunId, setTraceRunId] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState<ReadonlySet<string>>(new Set());
  const [cancelling, setCancelling] = React.useState(false);

  const view: ViewMode = search.get("view") === "tabs" ? "tabs" : "columns";
  const setView = (mode: ViewMode) => {
    const next = new URLSearchParams(search.toString());
    next.set("view", mode);
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };

  const refetch = () => qc.invalidateQueries({ queryKey: ["multi-agent-run", id] });

  const cancelRuns = async (runIds: string[]) => {
    setCancelling(true);
    try {
      await Promise.allSettled(runIds.map((r) => cancel.mutateAsync(r)));
    } finally {
      setCancelling(false);
      await refetch();
    }
  };

  const decide = async (findingId: string, kind: "accept" | "dismiss") => {
    if (!run) return;
    setPending((p) => new Set(p).add(findingId));
    try {
      await action.mutateAsync({ findingId, action: kind, prId: run.pr_id });
      await refetch();
    } catch {
      // Global error toast reports it.
    } finally {
      setPending((p) => {
        const n = new Set(p);
        n.delete(findingId);
        return n;
      });
    }
  };

  const crumb = [{ label: t("breadcrumbLab") }, { label: t("breadcrumb") }];

  if (!run) {
    let body: React.ReactNode;
    if (error instanceof ApiError && error.status === 404) {
      body = (
        <p style={s.message}>
          {t("notFound")}{" "}
          <button type="button" style={s.link} onClick={() => router.push("/multi-agent-review")}>
            {t("notFoundLink")}
          </button>
        </p>
      );
    } else if (error) {
      body = <p style={s.message}>{t("loadError")}</p>;
    } else {
      body = <div style={s.skeleton} role="status" aria-label={t("loading")} />;
    }
    return (
      <AppShell crumb={crumb}>
        <div style={s.page}>{body}</div>
      </AppShell>
    );
  }

  const running = run.columns.some((c) => c.status === "running");
  const traceCol = run.columns.find((c) => c.run_id === traceRunId);

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <RunHeader
          run={run}
          view={view}
          onViewChange={setView}
          onConfigure={() => {
            setRepoId(run.repo_id);
            router.push(`/multi-agent-review?pr=${encodeURIComponent(run.pr_id)}`);
          }}
          onCancelRemaining={() =>
            void cancelRuns(run.columns.filter((c) => c.status === "running").map((c) => c.run_id))
          }
          cancelling={cancelling}
        />
        <div style={s.body}>
          {view === "columns" ? (
            <ColumnsView
              columns={run.columns}
              groups={run.groups}
              onViewTrace={setTraceRunId}
              onCancel={(runId) => void cancelRuns([runId])}
            />
          ) : (
            <TabsView
              columns={run.columns}
              groups={run.groups}
              onAccept={(fid) => void decide(fid, "accept")}
              onDismiss={(fid) => void decide(fid, "dismiss")}
              onViewTrace={setTraceRunId}
              pendingFindingIds={pending}
            />
          )}
          <DisagreeBlock conflicts={run.conflicts} running={running} />
        </div>
      </div>
      {traceCol && (
        <RunTraceDrawer
          key={traceCol.run_id}
          runId={traceCol.run_id}
          agentName={traceCol.agent_name}
          prNumber={run.pr_number}
          findings={traceCol.findings}
          running={traceCol.status === "running"}
          onClose={() => setTraceRunId(null)}
        />
      )}
    </AppShell>
  );
}
