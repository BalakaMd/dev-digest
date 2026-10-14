/* CiRunDetails — drawer with one CI run's reproducibility data (AC-51): manifest
   version + SHA-256, model, runner/reviewer-core/Node versions, skill hashes and the
   reviewed commit. A run without a trace (failed, older runner) shows "—" (AC-49, AC-52). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer, ErrorState, Skeleton } from "@devdigest/ui";
import type { CiRunItem } from "@devdigest/shared";
import { useCiRun } from "../../../../lib/hooks";
import { EMPTY } from "../../../../lib/format";
import { formatCost, formatDuration, formatFindings, jobHref } from "../../../../components/ci-runs-table";
import { s } from "./styles";

export function CiRunDetails({ run, onClose }: { run: CiRunItem; onClose: () => void }) {
  const t = useTranslations("ci");
  const detail = useCiRun(run.id);
  const d = detail.data;
  const trace = d?.trace ?? null;
  const job = jobHref(run);

  const rows: Array<[string, React.ReactNode]> = [
    [t("runs.details.verdict"), t(`runs.verdict.${run.verdict}`)],
    [t("runs.details.agent"), run.agent_name ?? EMPTY],
    [t("runs.details.repo"), run.repo ?? EMPTY],
    [t("runs.details.findings"), formatFindings(run.findings_count)],
    [t("runs.details.cost"), formatCost(run.cost_usd)],
    [t("runs.details.duration"), formatDuration(run.duration_ms)],
    [
      t("runs.details.job"),
      job ? (
        <a href={job} target="_blank" rel="noopener noreferrer" style={s.link}>
          {t("runs.openJob")}
        </a>
      ) : (
        EMPTY
      ),
    ],
  ];
  const traceRows: Array<[string, React.ReactNode]> = [
    [t("runs.details.agentVersion"), trace ? `v${trace.manifest.agent_version}` : EMPTY],
    [t("runs.details.manifestSha"), trace?.manifest.sha256 || EMPTY],
    [t("runs.details.model"), d?.model || trace?.model || EMPTY],
    [t("runs.details.runnerVersion"), trace?.runner_version || EMPTY],
    [t("runs.details.reviewerCore"), trace?.reviewer_core_revision || EMPTY],
    [t("runs.details.node"), trace?.node_version || EMPTY],
    [t("runs.details.commit"), d?.head_sha || trace?.head_sha || EMPTY],
  ];

  return (
    <Drawer
      width={560}
      title={t("runs.details.title")}
      subtitle={run.repo && run.pr_number != null ? `${run.repo} #${run.pr_number}` : undefined}
      onClose={onClose}
    >
      <dl style={s.dl}>
        {rows.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt style={s.dt}>{k}</dt>
            <dd style={s.dd}>{v}</dd>
          </React.Fragment>
        ))}
      </dl>
      <h3 style={s.section}>{t("runs.details.traceHeading")}</h3>
      {detail.isLoading ? (
        <div aria-busy="true">
          <Skeleton height={20} />
        </div>
      ) : detail.isError ? (
        <ErrorState title={t("runs.details.loadError")} body={detail.error.message} onRetry={() => detail.refetch()} />
      ) : (
        <>
          <dl style={s.dl}>
            {traceRows.map(([k, v]) => (
              <React.Fragment key={k}>
                <dt style={s.dt}>{k}</dt>
                <dd style={{ ...s.dd, ...s.mono }}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
          <h3 style={s.section}>{t("runs.details.skillsHeading")}</h3>
          {trace && trace.skill_hashes.length > 0 ? (
            <dl style={s.dl}>
              {trace.skill_hashes.map((h) => (
                <React.Fragment key={h.slug}>
                  <dt style={s.dt}>{h.slug}</dt>
                  <dd style={{ ...s.dd, ...s.mono }}>{h.sha256}</dd>
                </React.Fragment>
              ))}
            </dl>
          ) : (
            <p style={s.subtitle}>{EMPTY}</p>
          )}
        </>
      )}
    </Drawer>
  );
}
