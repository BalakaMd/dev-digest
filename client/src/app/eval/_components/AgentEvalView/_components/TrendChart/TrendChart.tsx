/* TrendChart — recall, precision and citation accuracy per completed run in
   chronological order, with a legend and a 0–1 value scale (SPEC-06 AC-43).
   The SVG is decorative for assistive tech; a visually hidden table carries the
   same values (NFR-4/5). A null metric is skipped, never drawn as 0. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { formatMetricPct, formatRunTime } from "../../../../../../lib/format";
import type { TrendPoint } from "../../regression";
import { SERIES } from "./constants";
import { s } from "./styles";

const TICKS = [0, 0.2, 0.4, 0.6, 0.8, 1];

export function TrendChart({ points }: { points: TrendPoint[] }) {
  const t = useTranslations("eval");
  const rows = points.map((p) => ({
    label: formatRunTime(p.startedAt),
    recall: p.recall,
    precision: p.precision,
    citation_accuracy: p.citation_accuracy,
  }));

  return (
    <section aria-labelledby="eval-trend-title" style={s.card}>
      <div style={s.head}>
        <h2 id="eval-trend-title" style={s.title}>
          {t("dashboard.metricTrend")}
        </h2>
        <ul style={s.legend} aria-label={t("agentView.trendAlt")}>
          {SERIES.map((x) => (
            <li key={x.key} style={s.legendItem}>
              <span aria-hidden="true" style={s.swatch(x.color)} />
              {t(x.labelKey)}
            </li>
          ))}
        </ul>
      </div>
      {points.length === 0 ? (
        <p style={s.empty}>{t("agentView.trendEmpty")}</p>
      ) : (
        <>
          <div aria-hidden="true" style={s.plot} data-testid="trend-plot">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={rows} margin={{ top: 10, right: 16, bottom: 4, left: 0 }}>
                <CartesianGrid stroke="var(--border)" vertical={false} />
                <XAxis dataKey="label" hide />
                <YAxis
                  domain={[0, 1]}
                  ticks={TICKS}
                  tickFormatter={(v: number) => v.toFixed(1)}
                  tick={{ fontSize: 12, fill: "var(--text-muted)" }}
                  axisLine={false}
                  tickLine={false}
                  width={34}
                />
                {SERIES.map((x) => (
                  <Line
                    key={x.key}
                    type="monotone"
                    dataKey={x.key}
                    stroke={x.color}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                    isAnimationActive={false}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table style={s.srOnly} data-testid="trend-table">
            <caption>{t("agentView.trendAlt")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("agentView.trendRun")}</th>
                {SERIES.map((x) => (
                  <th key={x.key} scope="col">
                    {t(x.labelKey)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.runId}>
                  <th scope="row">{`${rows[i]?.label} v${p.version}`}</th>
                  {SERIES.map((x) => (
                    <td key={x.key}>{formatMetricPct(p[x.key])}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}
