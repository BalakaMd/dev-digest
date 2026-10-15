/* ExpandedRow — per-agent detail (AC-35). Read only while mounted (= row expanded);
   own loading placeholders and error + Retry (AC-60), the rest of the page is untouched. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useAgentPerformanceDetail } from "@/lib/hooks/agent-performance";
import { formatCostUsd } from "@/lib/format";
import { s } from "./styles";

const SOURCES = [
  ["provider", "sourceProvider"],
  ["estimate", "sourceEstimate"],
  ["mixed", "sourceMixed"],
  ["unknown", "sourceUnknown"],
] as const;

export function ExpandedRow({
  agentId,
  repoId,
  applied,
  id,
}: {
  agentId: string;
  repoId: string;
  applied: { from: string; to: string };
  id: string;
}) {
  const t = useTranslations("agentPerformance");
  const q = useAgentPerformanceDetail(agentId, repoId, applied);

  if (q.isError) {
    return (
      <div id={id} style={s.error} role="alert">
        <span>{t("expanded.error")}</span>
        <button type="button" style={s.retry} onClick={() => void q.refetch()}>
          {t("retry")}
        </button>
      </div>
    );
  }
  if (!q.data) {
    return (
      <div id={id} role="status" aria-busy="true" aria-label={t("expanded.loading")}>
        <div style={s.skeleton} />
        <div style={{ ...s.skeleton, width: "50%" }} />
        <div style={{ ...s.skeleton, width: "60%" }} />
      </div>
    );
  }
  const d = q.data;
  return (
    <div id={id} style={s.detailGrid}>
      <section aria-label={t("expanded.costByModel")}>
        <h4 style={s.detailTitle}>{t("expanded.costByModel")}</h4>
        {d.cost_by_model.length === 0 ? (
          <p style={{ ...s.muted, margin: 0, fontSize: 13 }}>{t("expanded.noModelCost")}</p>
        ) : (
          <ul style={s.list}>
            {d.cost_by_model.map((m) => (
              <li key={m.model ?? "unknown"}>
                {m.model ?? t("expanded.unknownModel")} · {formatCostUsd(m.cost_usd)}
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-label={t("expanded.findings")}>
        <h4 style={s.detailTitle}>{t("expanded.findings")}</h4>
        <ul style={s.list}>
          <li>{t("expanded.accepted", { count: d.accept.accepted })}</li>
          <li>{t("expanded.dismissed", { count: d.accept.dismissed })}</li>
          <li>{t("expanded.undecided", { count: d.undecided })}</li>
        </ul>
      </section>
      <section aria-label={t("expanded.runsBySource")}>
        <h4 style={s.detailTitle}>{t("expanded.runsBySource")}</h4>
        <ul style={s.list}>
          <li>{t("expanded.local", { count: d.runs_by_source.local })}</li>
          <li>{t("expanded.ci", { count: d.runs_by_source.ci })}</li>
        </ul>
      </section>
      <section aria-label={t("expanded.costBySource")}>
        <h4 style={s.detailTitle}>{t("expanded.costBySource")}</h4>
        <ul style={s.list}>
          {SOURCES.map(([src, key]) => (
            <li key={src}>{t(`cards.${key}`, { amount: formatCostUsd(d.cost_by_source[src]), percent: d.cost_by_source ? pct(d.cost_by_source[src], d.cost_by_source) : 0 })}</li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function pct(amount: number, by: { provider: number; estimate: number; mixed: number; unknown: number }): number {
  const total = by.provider + by.estimate + by.mixed + by.unknown;
  return total > 0 ? Math.round((amount / total) * 100) : 0;
}
