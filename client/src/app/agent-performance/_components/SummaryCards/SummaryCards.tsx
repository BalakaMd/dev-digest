/* SummaryCards — the four stat cards (AC-26..AC-29, AC-66, AC-59, AC-42). */
"use client";

import React from "react";
import type { AgentPerformanceOverview } from "@devdigest/shared";
import { TotalRunsCard } from "./TotalRunsCard";
import { TotalCostCard } from "./TotalCostCard";
import { AvgAcceptCard } from "./AvgAcceptCard";
import { MostActiveCard } from "./MostActiveCard";
import { s } from "./styles";

export interface SummaryCardsProps {
  totals: AgentPerformanceOverview["totals"];
  previousPeriod: AgentPerformanceOverview["previous_period"];
  buckets: AgentPerformanceOverview["buckets"];
  /** Card-label text from `rangeLabel()`: "1D", "30D" or "<start> – <end>". */
  rangeLabel: string;
  onOpenMostActive: (agentId: string) => void;
}

export function SummaryCards({ totals, previousPeriod, buckets, rangeLabel, onOpenMostActive }: SummaryCardsProps) {
  return (
    <div style={s.grid}>
      <TotalRunsCard runs={totals.runs} buckets={buckets} rangeLabel={rangeLabel} />
      <TotalCostCard totals={totals} previous={previousPeriod} rangeLabel={rangeLabel} />
      <AvgAcceptCard accept={totals.accept} />
      <MostActiveCard agent={totals.most_active} onOpen={onOpenMostActive} />
    </div>
  );
}
