/* CostBreakdown — "Cost breakdown" section with By agent / By model donuts (AC-38, AC-39, AC-51). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AgentPerformanceOverview } from "@devdigest/shared";
import { hasNoPricedRuns, type SliceInput } from "../../_model/breakdown";
import { CostDonut } from "./CostDonut";
import { s } from "./styles";

export type CostBreakdownProps = {
  overview: Pick<AgentPerformanceOverview, "totals" | "cost_by_agent" | "cost_by_model">;
};

export function CostBreakdown({ overview }: CostBreakdownProps) {
  const t = useTranslations("agentPerformance");
  const { totals } = overview;
  const byAgent = React.useMemo<SliceInput[]>(
    () =>
      overview.cost_by_agent.map((a) => ({
        id: a.agent_id,
        name: a.name ?? t("breakdown.deletedAgent"),
        amount: a.cost_usd,
      })),
    [overview.cost_by_agent, t],
  );
  const byModel = React.useMemo<SliceInput[]>(
    () =>
      overview.cost_by_model.map((m) => ({
        id: m.model,
        name: m.model ?? t("breakdown.unknownModel"),
        amount: m.cost_usd,
      })),
    [overview.cost_by_model, t],
  );
  const noPriced = hasNoPricedRuns(totals.runs, totals.not_priced_runs);
  return (
    <section style={s.section} aria-labelledby="agent-perf-breakdown-title">
      <h2 id="agent-perf-breakdown-title" style={s.title}>
        {t("breakdown.title")}
      </h2>
      {noPriced ? (
        <p style={s.empty} role="status">
          {t("breakdown.noPriced")}
        </p>
      ) : (
        <div style={s.grid}>
          <CostDonut title={t("breakdown.byAgent")} slices={byAgent} totalCost={totals.total_cost_usd} />
          <CostDonut title={t("breakdown.byModel")} slices={byModel} totalCost={totals.total_cost_usd} />
        </div>
      )}
    </section>
  );
}
