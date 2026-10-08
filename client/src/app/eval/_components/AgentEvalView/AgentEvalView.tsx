/* AgentEvalView — /eval/[agentId]: one agent's eval dashboard (SPEC-06 AC-27, 28, 30,
   37, 42, 43, 45, 55, 56, 61, 62, 67). Metric tiles, regression banner, trend chart
   and run history; "Run eval", an agent switcher, a period filter (30 days by default).
   Failed and running runs are listed with their status; latest, deltas, trend, banner
   and Compare use completed runs only (Q-6). Compare opens the CompareModal and a run's
   start time opens the CaseResultDrawer (S15); `onCompare` / `onOpenRun` stay as
   optional observers of those two actions. */
"use client";

import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import type { EvalSuiteRun } from "@devdigest/shared";
import { AppShell } from "../../../../components/app-shell";
import { EvalMetricTiles } from "../../../../components/eval-metric-tiles";
import { useAgent, useAgents } from "../../../../lib/hooks/agents";
import { useEvalCases, useEvalCompare, useEvalRuns, useInvalidateOnRunFinish, useStartEvalRun } from "../../../../lib/hooks/eval";
import { notify } from "../../../../lib/toast";
import { CaseResultDrawer } from "./_components/CaseResultDrawer";
import { CompareModal } from "./_components/CompareModal";
import { RegressionBanner } from "./_components/RegressionBanner";
import { RunHistoryTable } from "./_components/RunHistoryTable";
import { TrendChart } from "./_components/TrendChart";
import { DEFAULT_PERIOD, PERIODS, type Period, periodDays } from "./constants";
import { comparePair, completedRuns, detectDrops, passedToFailed, trendPoints } from "./regression";
import { s } from "./styles";

/** Runs fetched for the tiles, banner and progress, whatever the period filter. */
const OVERVIEW_LIMIT = 20;

export interface AgentEvalViewProps {
  agentId: string;
  /** Called when the Compare modal opens for the two selected completed runs. */
  onCompare?: (older: EvalSuiteRun, newer: EvalSuiteRun) => void;
  /** Called when a run's case results open. */
  onOpenRun?: (run: EvalSuiteRun) => void;
}

export function AgentEvalView({ agentId, onCompare, onOpenRun }: AgentEvalViewProps) {
  const t = useTranslations("eval");
  const router = useRouter();
  const agent = useAgent(agentId);
  const agents = useAgents();
  const cases = useEvalCases(agentId);
  const startRun = useStartEvalRun(agentId);
  const invalidateOnRunFinish = useInvalidateOnRunFinish(agentId);
  const [period, setPeriod] = React.useState<Period>(DEFAULT_PERIOD);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState("");
  const [comparing, setComparing] = React.useState<[EvalSuiteRun, EvalSuiteRun] | null>(null);
  const [openedRun, setOpenedRun] = React.useState<EvalSuiteRun | null>(null);
  const [startError, setStartError] = React.useState<string | null>(null);

  // Tiles / banner / progress read the latest runs regardless of the period filter;
  // the chart and the history are limited to the chosen period (AC-55).
  const overview = useEvalRuns(agentId, { limit: OVERVIEW_LIMIT });
  const periodRuns = useEvalRuns(agentId, { days: periodDays(period) });

  const history = React.useMemo(
    () => [...(periodRuns.data ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [periodRuns.data],
  );
  const recent = React.useMemo(
    () => [...(overview.data ?? [])].sort((a, b) => b.started_at.localeCompare(a.started_at)),
    [overview.data],
  );
  const running = recent.find((r) => r.status === "running") ?? null;
  const completed = completedRuns(recent);
  const latest = completed[0] ?? null;
  const previous = completed[1] ?? null;
  const drops = detectDrops(latest, previous);
  const regressed = drops.length > 0;
  // Names of the cases that flipped passed → failed come from the compare endpoint.
  const compare = useEvalCompare(regressed ? previous?.id : null, regressed ? latest?.id : null);
  const points = React.useMemo(() => trendPoints(history), [history]);

  // Drop selections that left the visible history (period changed, run vanished).
  React.useEffect(() => {
    setSelected((cur) => {
      const next = cur.filter((id) => history.some((r) => r.id === id));
      return next.length === cur.length ? cur : next;
    });
  }, [history]);

  // Announce the end of a run that was in progress while this view was open (NFR-6).
  const watched = React.useRef<string | null>(null);
  React.useEffect(() => {
    if (running) {
      watched.current = running.id;
      return;
    }
    const prev = watched.current ? recent.find((r) => r.id === watched.current) : undefined;
    if (!prev) return;
    watched.current = null;
    invalidateOnRunFinish();
    const msg =
      prev.status === "failed"
        ? t("agentView.runFailed", { reason: prev.error ?? "" })
        : t("agentView.runFinished", { passed: prev.cases_passed, total: prev.cases_total - prev.cases_errored });
    setAnnouncement(msg);
    if (prev.status === "failed") notify.error(msg);
    else notify.success(msg);
  }, [running, recent, t, invalidateOnRunFinish]);

  const caseCount = cases.data?.length ?? 0;
  const noCases = !cases.isLoading && !cases.isError && caseCount === 0;
  const reasonId = React.useId();
  const runReason = running ? t("agentView.runDisabledRunning") : noCases ? t("agentView.runDisabledEmpty") : null;

  const onRunEval = () => {
    setStartError(null);
    startRun.mutate(undefined, {
      onSuccess: () => setAnnouncement(t("agentView.runStarted")),
      // e.g. a missing API key: show the API's own message next to the button.
      onError: (e) => {
        const msg = e.message || t("agentView.runStartFailed");
        setStartError(msg);
        notify.error(msg);
      },
    });
  };

  const toggle = (id: string) => setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));
  const pair = comparePair(selected, history);
  const onCompareClick = () => {
    if (!pair) return;
    setComparing(pair);
    onCompare?.(pair[0], pair[1]);
  };
  const onOpenRunClick = (run: EvalSuiteRun) => {
    setOpenedRun(run);
    onOpenRun?.(run);
  };

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvalDashboard"), href: "/eval" },
    { label: agent.data?.name ?? "…" },
  ];

  if (agent.isError || (!agent.isLoading && !agent.data)) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("agentView.agentLoadError")}
          body={agent.error?.message ?? ""}
          onRetry={() => agent.refetch()}
        />
      </AppShell>
    );
  }

  const progress = running ? t("dashboard.progress", { done: running.cases_done, total: running.cases_total }) : "";

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        <Link href="/eval" style={s.back}>
          <Icon.ChevronLeft size={14} aria-hidden="true" />
          {t("agentView.allAgents")}
        </Link>

        <div style={s.header}>
          <div style={s.headerText}>
            {agent.isLoading || !agent.data ? (
              <Skeleton height={30} width={260} />
            ) : (
              <div style={s.titleRow}>
                <h1 style={s.h1}>{agent.data.name}</h1>
                <Badge color="var(--text-secondary)" mono>
                  {agent.data.model}
                </Badge>
              </div>
            )}
            <p style={s.subtitle}>{t("agentView.subtitle", { cases: caseCount })}</p>
          </div>
          <div style={s.controls}>
            <select
              aria-label={t("dashboard.agentSwitcher")}
              value={agentId}
              onChange={(e) => router.push(`/eval/${e.target.value}`)}
              style={s.select}
            >
              {!(agents.data ?? []).some((a) => a.id === agentId) && <option value={agentId}>{agent.data?.name ?? agentId}</option>}
              {(agents.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
            <select
              aria-label={t("dashboard.periodFilter")}
              value={period}
              onChange={(e) => setPeriod(e.target.value as Period)}
              style={s.select}
            >
              {PERIODS.map((p) => (
                <option key={p} value={p}>
                  {t(`dashboard.period.${p}`)}
                </option>
              ))}
            </select>
            <Button
              kind="primary"
              icon="Play"
              loading={startRun.isPending}
              disabled={!!runReason || cases.isLoading || startRun.isPending}
              aria-describedby={runReason ? reasonId : undefined}
              onClick={onRunEval}
            >
              {t("agentView.runEval")}
            </Button>
          </div>
        </div>

        <div style={s.statusRow}>
          {runReason && (
            <span id={reasonId} style={s.reason}>
              {runReason}
            </span>
          )}
          <div role="status" data-testid="run-status" style={s.status}>
            {progress || announcement}
          </div>
          {startError && (
            <div role="alert" style={s.error}>
              {startError}
            </div>
          )}
        </div>

        {overview.isLoading || periodRuns.isLoading ? (
          <div aria-busy="true" aria-label={t("dashboard.loading")} style={s.loading}>
            <Skeleton height={90} />
            <Skeleton height={240} />
          </div>
        ) : overview.isError || periodRuns.isError ? (
          <ErrorState
            title={t("dashboard.loadError")}
            body={(overview.error ?? periodRuns.error)?.message ?? ""}
            onRetry={() => {
              overview.refetch();
              periodRuns.refetch();
            }}
          />
        ) : (
          <>
            {regressed && latest && previous && (
              <RegressionBanner
                drops={drops}
                version={latest.agent_version}
                previousVersion={previous.agent_version}
                flipped={passedToFailed(compare.data)}
                flippedLoading={compare.isLoading}
              />
            )}
            <div style={s.block}>
              <EvalMetricTiles latest={latest} previous={previous} />
            </div>
            <TrendChart points={points} />
            <RunHistoryTable
              runs={history}
              selected={selected}
              onToggle={toggle}
              canCompare={!!pair}
              onCompare={onCompareClick}
              onOpenRun={onOpenRunClick}
            />
          </>
        )}
      </div>
      {comparing && (
        <CompareModal agentId={agentId} older={comparing[0]} newer={comparing[1]} onClose={() => setComparing(null)} />
      )}
      {openedRun && <CaseResultDrawer run={openedRun} onClose={() => setOpenedRun(null)} />}
    </AppShell>
  );
}
