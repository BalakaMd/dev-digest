/* CostDonut — one breakdown as a ring + a text legend listing EVERY slice (AC-38, AC-51).
   Zero total → one neutral ring, legend still $0.00 · 0% (Q-3). The ring is decorative;
   the legend carries the same values as text (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Cell, Pie, PieChart } from "recharts";
import { buildBreakdown, formatLegendUsd, type SliceInput } from "../../_model/breakdown";
import { FocusTip } from "../FocusTip";
import { s } from "./styles";

const SIZE = 150;
const STROKE = 24;
const OTHER_COLOR = "var(--text-muted)";
const NEUTRAL_COLOR = "var(--border-strong)";
const PALETTE = ["var(--crit)", "var(--warn)", "var(--accent)", "var(--ok)", "#8b5cf6", "#ec4899"];

export function CostDonut({
  title,
  slices,
  totalCost,
}: {
  title: string;
  slices: readonly SliceInput[];
  totalCost: number;
}) {
  const t = useTranslations("agentPerformance");
  const { segments, legend, neutral } = React.useMemo(
    () => buildBreakdown(slices, totalCost, t("breakdown.other")),
    [slices, totalCost, t],
  );
  const colorAt = (i: number) => (i < PALETTE.length ? PALETTE[i]! : OTHER_COLOR);
  // Segment i < TOP_SLICES shares its colour with legend row i; "Other" is always muted.
  const segmentColor = (i: number, isOther: boolean) => (isOther ? OTHER_COLOR : colorAt(i));
  const hasOther = segments.length > 0 && segments !== legend;
  const ring = neutral ? [{ name: "", value: 1 }] : segments.map((x) => ({ name: x.name, value: x.amount }));

  return (
    <section style={s.panel} aria-label={title}>
      <h3 style={s.panelTitle}>{title}</h3>
      <div style={s.body}>
        <div aria-hidden="true" style={{ flexShrink: 0, width: SIZE, height: SIZE }}>
          <PieChart width={SIZE} height={SIZE}>
            <Pie
              data={ring}
              dataKey="value"
              nameKey="name"
              cx="50%"
              cy="50%"
              innerRadius={(SIZE - STROKE) / 2 - STROKE / 2}
              outerRadius={(SIZE - STROKE) / 2 + STROKE / 2}
              startAngle={90}
              endAngle={-270}
              isAnimationActive={false}
              stroke="none"
            >
              {neutral ? (
                <Cell fill={NEUTRAL_COLOR} />
              ) : (
                segments.map((seg, i) => (
                  <Cell key={i} fill={segmentColor(i, hasOther && i === segments.length - 1)} />
                ))
              )}
            </Pie>
          </PieChart>
        </div>
        <ul style={s.legend}>
          {legend.map((l, i) => (
            <FocusTip
              as="li"
              key={`${l.id ?? "none"}:${i}`}
              focusable
              lines={[l.name]}
              title={l.name}
              style={s.legendRow}
            >
              <span aria-hidden="true" style={s.swatch(neutral ? NEUTRAL_COLOR : colorAt(i))} />
              <span style={s.legendName}>{l.name}</span>
              <span style={s.legendAmount}>{formatLegendUsd(l.amount)}</span>
              <span style={s.legendPercent}>{l.percent}%</span>
            </FocusTip>
          ))}
        </ul>
      </div>
    </section>
  );
}
