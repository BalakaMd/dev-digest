/* CompareModal — two completed runs of one agent side by side (SPEC-06 AC-31–33, 41,
   45, 59, 67, 70, 76): recall / precision / citation / cost older → newer with a signed
   difference, a notice for cases scored in only one run, the cases whose outcome flipped,
   errored counts and the configuration diff. "Promote" saves the newer run's
   configuration as a new agent version; it is disabled while that version is already
   current (AC-70). Every stored text is rendered as plain text (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Modal, Skeleton } from "@devdigest/ui";
import type { AgentRestoreResponse, EvalCompareCaseRef, EvalCompareMetric, EvalSuiteRun } from "@devdigest/shared";
import { formatCostOrDash, formatDeltaPts, formatMetricPct } from "../../../../../../lib/format";
import { useAgent } from "../../../../../../lib/hooks/agents";
import { useEvalCompare } from "../../../../../../lib/hooks/eval";
import { useRestoreAgentVersion } from "../../../../../../lib/hooks/agents";
import { ConfigDiff } from "./_components/ConfigDiff";
import { s } from "./styles";

export interface CompareModalProps {
  agentId: string;
  /** The two completed runs, ordered older → newer (the API orders them again by itself). */
  older: EvalSuiteRun;
  newer: EvalSuiteRun;
  onClose: () => void;
}

const TILES = [
  { key: "recall", labelKey: "compare.recall" },
  { key: "precision", labelKey: "compare.precision" },
  { key: "citation_accuracy", labelKey: "compare.citation" },
] as const;

/** "▲ +$0.02" / "▼ −$0.01"; "" when either side is unknown (AC-76). */
function formatCostDelta(delta: number | null): string {
  if (delta == null || Number.isNaN(delta)) return "";
  if (delta === 0) return "0";
  return `${delta > 0 ? "▲ +" : "▼ −"}${formatCostOrDash(Math.abs(delta))}`;
}

function MetricTile({ label, metric }: { label: string; metric: EvalCompareMetric }) {
  const delta = metric.delta_pp == null ? "" : formatDeltaPts(metric.delta_pp);
  return (
    <div style={s.tile} data-testid={`compare-tile-${label}`}>
      <div style={s.label}>{label}</div>
      <div style={s.valueRow}>
        <span style={s.older}>{formatMetricPct(metric.older)}</span>
        <span style={s.arrow} aria-hidden="true">
          →
        </span>
        <span style={s.newer}>{formatMetricPct(metric.newer)}</span>
        {delta && <span style={s.delta(metric.delta_pp ?? 0)}>{delta}</span>}
      </div>
    </div>
  );
}

function CaseList({ heading, cases }: { heading: string; cases: EvalCompareCaseRef[] }) {
  const t = useTranslations("eval");
  if (cases.length === 0) return null;
  return (
    <div>
      <div style={s.label}>{heading}</div>
      <ul style={s.list}>
        {cases.map((c, i) => (
          <li key={`${c.case_id ?? "deleted"}-${i}`}>
            {c.case_name}{" "}
            <span style={s.mono}>({c.expectation_types.map((x) => t(typeKey(x))).join(", ")})</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function typeKey(type: string): string {
  return type === "must_find" ? "evalsTab.typeMustFind" : "evalsTab.typeMustNotFlag";
}

export function CompareModal({ agentId, older, newer, onClose }: CompareModalProps) {
  const t = useTranslations("eval");
  const compare = useEvalCompare(older.id, newer.id);
  const agent = useAgent(agentId);
  const restore = useRestoreAgentVersion(agentId);
  const [promoted, setPromoted] = React.useState<AgentRestoreResponse | null>(null);
  const [promoteError, setPromoteError] = React.useState<string | null>(null);
  const hintId = React.useId();

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The API orders the pair itself; show what it answered once it did.
  const data = compare.data;
  const olderRun = data?.older ?? older;
  const newerRun = data?.newer ?? newer;
  const currentVersion = agent.data?.version;
  const alreadyCurrent = currentVersion != null && currentVersion === newerRun.agent_version;
  const canPromote = !!data && !alreadyCurrent && !promoted && !restore.isPending;

  const onPromote = () => {
    setPromoteError(null);
    restore.mutate(newerRun.agent_version, {
      onSuccess: (res) => setPromoted(res),
      onError: (e) => setPromoteError(e.message || t("compare.promoteFailed")),
    });
  };

  const costDelta = data ? formatCostDelta(data.cost.delta) : "";
  const onlyOne = data ? data.only_in_older.length > 0 || data.only_in_newer.length > 0 : false;

  return (
    <Modal
      width={960}
      title={t("compare.titleVersions", { older: olderRun.agent_version, newer: newerRun.agent_version })}
      subtitle={t("compare.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="secondary" onClick={onClose}>
            {t("compare.close")}
          </Button>
          <Button
            kind="primary"
            icon="GitBranch"
            loading={restore.isPending}
            disabled={!canPromote}
            aria-describedby={alreadyCurrent ? hintId : undefined}
            onClick={onPromote}
          >
            {t("compare.promoteTo", { version: newerRun.agent_version })}
          </Button>
          {alreadyCurrent && (
            <span id={hintId} style={s.hint}>
              {t("compare.promoteAlreadyCurrent")}
            </span>
          )}
          <div role="status" style={s.ok}>
            {promoted && t("compare.promoted", { version: promoted.version })}
          </div>
          {promoteError && (
            <div role="alert" style={s.error}>
              {promoteError}
            </div>
          )}
        </div>
      }
    >
      <div style={s.body}>
        {compare.isLoading ? (
          <div aria-busy="true" aria-label={t("compare.loading")}>
            <Skeleton height={90} />
          </div>
        ) : compare.isError || !data ? (
          <ErrorState title={t("compare.loadError")} body={compare.error?.message ?? ""} onRetry={() => compare.refetch()} />
        ) : (
          <>
            <div style={s.tiles}>
              {TILES.map(({ key, labelKey }) => (
                <MetricTile key={key} label={t(labelKey)} metric={data[key]} />
              ))}
              <div style={s.tile} data-testid="compare-tile-cost">
                <div style={s.label}>{t("compare.cost")}</div>
                <div style={s.valueRow}>
                  <span style={s.older}>{formatCostOrDash(data.cost.older)}</span>
                  <span style={s.arrow} aria-hidden="true">
                    →
                  </span>
                  <span style={s.newer}>{formatCostOrDash(data.cost.newer)}</span>
                  {costDelta && <span style={s.delta(0)}>{costDelta}</span>}
                </div>
              </div>
            </div>
            <p style={s.muted}>{t("compare.sharedCases", { count: data.shared_case_count })}</p>

            {onlyOne && (
              <div style={s.notice} role="note" data-testid="compare-not-same-set">
                <strong>{t("compare.notSameSet")}</strong>
                <CaseList heading={t("compare.onlyInOlder")} cases={data.only_in_older} />
                <CaseList heading={t("compare.onlyInNewer")} cases={data.only_in_newer} />
              </div>
            )}

            <section style={s.section} aria-labelledby="eval-compare-flipped">
              <h3 id="eval-compare-flipped" style={s.heading}>
                {t("compare.flipped")}
              </h3>
              {data.flipped.length === 0 ? (
                <p style={s.muted}>{t("compare.flippedNone")}</p>
              ) : (
                <ul style={s.list}>
                  {data.flipped.map((f, i) => (
                    <li key={`${f.case_id ?? "deleted"}-${i}`}>
                      {f.case_name}{" "}
                      <span style={s.mono}>({f.expectation_types.map((x) => t(typeKey(x))).join(", ")})</span>{" "}
                      <strong>{f.from === "passed" ? t("compare.passedToFailed") : t("compare.failedToPassed")}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <p style={s.muted}>{t("compare.errored", { older: data.errored.older, newer: data.errored.newer })}</p>

            <ConfigDiff
              diff={data.config_diff}
              olderVersion={olderRun.agent_version}
              newerVersion={newerRun.agent_version}
              skippedSkills={promoted?.skipped_skill_ids ?? []}
            />
          </>
        )}
      </div>
    </Modal>
  );
}
