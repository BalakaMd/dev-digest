"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerformanceOverview } from "@devdigest/shared";
import { formatCostUsd } from "@/lib/format";
import { s } from "./styles";

type Totals = AgentPerformanceOverview["totals"];
type Previous = AgentPerformanceOverview["previous_period"];

const SOURCES = [
  ["provider", "sourceProvider"],
  ["estimate", "sourceEstimate"],
  ["mixed", "sourceMixed"],
  ["unknown", "sourceUnknown"],
] as const;

/** Signed difference text, e.g. "−$1.20" / "+$0.40" / "$0.00". */
function signedDelta(delta: number): string {
  if (delta === 0) return formatCostUsd(0);
  return `${delta < 0 ? "−" : "+"}${formatCostUsd(Math.abs(delta))}`;
}

export function TotalCostCard({
  totals,
  previous,
  rangeLabel,
}: {
  totals: Totals;
  previous: Previous;
  rangeLabel: string;
}) {
  const t = useTranslations("agentPerformance");
  const total = totals.total_cost_usd;
  const delta = total - previous.total_cost_usd;
  const tone = delta < 0 ? "down" : delta > 0 ? "up" : "flat";
  const percent = (amount: number) => (total > 0 ? Math.round((amount / total) * 100) : 0);
  return (
    <section style={s.card} aria-label={t("cards.totalCost", { range: rangeLabel })}>
      <div style={s.label}>{t("cards.totalCost", { range: rangeLabel })}</div>
      <div style={s.valueRow}>
        <span style={s.value}>{formatCostUsd(total)}</span>
        {previous.has_runs ? (
          <span style={s.delta(tone)}>{t("cards.vsPrevious", { delta: signedDelta(delta) })}</span>
        ) : (
          <span style={s.muted}>{t("cards.noPrevious")}</span>
        )}
      </div>
      <ul style={s.sources}>
        {SOURCES.filter(([src]) => totals.cost_by_source[src] > 0).map(([src, key]) => (
          <li key={src}>
            {t(`cards.${key}`, { amount: formatCostUsd(totals.cost_by_source[src]), percent: percent(totals.cost_by_source[src]) })}
          </li>
        ))}
      </ul>
      {totals.not_priced_runs > 0 ? <div style={s.warn}>{t("cards.notPriced", { count: totals.not_priced_runs })}</div> : null}
      <p style={s.note}>{t("reviewRunsOnly")}</p>
    </section>
  );
}
