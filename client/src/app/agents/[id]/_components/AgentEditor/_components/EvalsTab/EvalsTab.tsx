/* EvalsTab — the agent's eval cases and the metrics of its latest completed run
   (SPEC-06 AC-10…12, 17, 19, 27, 58, 61, 62, 63, 64). Failed and running runs
   are reported by status; metrics, deltas and the tiles use completed runs only.
   "New eval case" / Edit open the case editor modal (state held here); the
   optional `onNewCase` / `onEditCase` callbacks are notified as well. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseSummary } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../../components/confirm-dialog";
import { EvalMetricTiles } from "../../../../../../../components/eval-metric-tiles";
import {
  useDeleteEvalCase,
  useEvalCases,
  useEvalRuns,
  useRunEvalCase,
  useStartEvalRun,
} from "../../../../../../../lib/hooks/eval";
import { notify } from "../../../../../../../lib/toast";
import { CaseEditorModal } from "./_components/CaseEditorModal";
import { CaseRow } from "./_components/CaseRow";
import { s } from "./styles";

export function EvalsTab({
  agent,
  onNewCase,
  onEditCase,
}: {
  agent: Agent;
  /** Open the case editor for a new case (wired by the case editor modal). */
  onNewCase?: () => void;
  /** Open the case editor for an existing case. */
  onEditCase?: (caseId: string) => void;
}) {
  const t = useTranslations("eval");
  const cases = useEvalCases(agent.id);
  const runs = useEvalRuns(agent.id);
  const startRun = useStartEvalRun(agent.id);
  const runCase = useRunEvalCase(agent.id);
  const deleteCase = useDeleteEvalCase(agent.id);
  const [toDelete, setToDelete] = React.useState<EvalCaseSummary | null>(null);
  /** Case editor: closed (undefined), a new case ("new") or a stored case id. */
  const [editor, setEditor] = React.useState<string | "new" | undefined>(undefined);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);

  const history = React.useMemo(
    () => [...(runs.data ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [runs.data],
  );
  const running = history.find((r) => r.status === "running") ?? null;
  const completed = history.filter((r) => r.status === "done");
  const latest = completed[0] ?? null;
  const previous = completed[1] ?? null;
  const newest = history[0] ?? null;

  // Announce the end of a run that was in progress while this tab was open (NFR-6).
  const watched = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (running) {
      watched.current = running.id;
      return;
    }
    const prev = watched.current && history.find((r) => r.id === watched.current);
    if (!prev) return;
    watched.current = null;
    const msg =
      prev.status === "failed"
        ? t("evalsTab.runFailed", { reason: prev.error ?? "" })
        : t("evalsTab.runFinished", { passed: prev.cases_passed, total: prev.cases_total - prev.cases_errored });
    setAnnouncement(msg);
    if (prev.status === "failed") notify.error(msg);
    else notify.success(msg);
  }, [running, history, t]);

  const list = cases.data ?? [];
  const noCases = !cases.isLoading && !cases.isError && list.length === 0;
  const reasonId = React.useId();
  const runReason = running ? t("evalsTab.runDisabledRunning") : noCases ? t("evalsTab.runDisabledEmpty") : null;
  const runDisabled = !!runReason || cases.isLoading || startRun.isPending;

  const onRunAll = () =>
    startRun.mutate(undefined, {
      onSuccess: () => notify.info(t("evalsTab.runStarted")),
      onError: (e) => notify.error(e.message || t("evalsTab.runFailedToStart")),
    });
  const onRunCase = (id: string) =>
    runCase.mutate(id, { onError: (e) => notify.error(e.message || t("evalsTab.runCaseFailed")) });
  const onConfirmDelete = () => {
    if (!toDelete) return;
    deleteCase.mutate(toDelete.id, {
      onSuccess: () => setToDelete(null),
      onError: (e) => {
        setToDelete(null);
        notify.error(e.message || t("evalsTab.deleteFailed"));
      },
    });
  };

  const statusText = running
    ? t("evalsTab.inProgress", { done: running.cases_done, total: running.cases_total })
    : newest?.status === "failed"
      ? t("evalsTab.runFailedStatus", { reason: newest.error ?? "" })
      : announcement;

  return (
    <div style={s.wrap}>
      <section aria-labelledby="eval-metrics-title">
        <div style={s.metricsHeader}>
          <h2 id="eval-metrics-title" style={s.metricsTitle}>
            {t("evalsTab.metricsTitle")}
          </h2>
          <Link href={`/eval/${agent.id}`} style={s.dashLink}>
            {t("evalsTab.viewDashboard")}
          </Link>
        </div>
        <div style={{ marginTop: 10 }}>
          <EvalMetricTiles latest={latest} previous={previous} />
        </div>
      </section>

      <section aria-labelledby="eval-cases-title">
        <div style={s.casesHeader}>
          <h2 id="eval-cases-title" style={s.casesTitle}>
            {t("evalsTab.casesHeading")}
          </h2>
          {!cases.isLoading && !cases.isError && (
            <span style={s.casesCount}>{t("evalsTab.casesSummary", { count: list.length })}</span>
          )}
          <div style={s.headerActions}>
            {runReason && (
              <span id={reasonId} style={s.reason}>
                {runReason}
              </span>
            )}
            <Button
              kind="secondary"
              icon="Play"
              disabled={runDisabled}
              loading={startRun.isPending}
              aria-describedby={runReason ? reasonId : undefined}
              onClick={onRunAll}
            >
              {t("evalsTab.runAll")}
            </Button>
            <Button
              kind="primary"
              icon="Plus"
              onClick={() => {
                setEditor("new");
                onNewCase?.();
              }}
            >
              {t("evalsTab.newCase")}
            </Button>
          </div>
        </div>

        <div role="status" style={statusText && newest?.status === "failed" && !running ? s.statusFailed : s.status}>
          {statusText}
        </div>

        {cases.isLoading ? (
          <div aria-busy="true" aria-label={t("evalsTab.loadingCases")} style={s.list}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : cases.isError ? (
          <ErrorState title={t("evalsTab.casesLoadError")} body={cases.error.message} onRetry={() => cases.refetch()} />
        ) : noCases ? (
          <EmptyState icon="FlaskConical" title={t("evalsTab.casesHeading")} body={t("evalsTab.emptyCases")} />
        ) : (
          <ul style={s.list}>
            {list.map((c) => (
              <CaseRow
                key={c.id}
                evalCase={c}
                running={runCase.isPending && runCase.variables === c.id}
                runDisabled={runCase.isPending || !!running}
                onRun={() => onRunCase(c.id)}
                onEdit={() => {
                  setEditor(c.id);
                  onEditCase?.(c.id);
                }}
                onDelete={() => setToDelete(c)}
              />
            ))}
          </ul>
        )}
      </section>

      {editor !== undefined && (
        <CaseEditorModal
          key={editor}
          agent={agent}
          caseId={editor === "new" ? null : editor}
          onClose={() => setEditor(undefined)}
        />
      )}

      {toDelete && (
        <ConfirmDialog
          title={t("evalsTab.confirmDeleteTitle")}
          body={t("evalsTab.deleteConfirm", { name: toDelete.name })}
          confirmLabel={t("evalsTab.confirmDelete")}
          pending={deleteCase.isPending}
          onConfirm={onConfirmDelete}
          onCancel={() => setToDelete(null)}
        />
      )}
    </div>
  );
}
