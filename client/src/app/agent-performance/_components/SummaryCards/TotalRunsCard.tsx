"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PerfBucket } from "@devdigest/shared";
import { srOnly } from "../sr-only";
import { s } from "./styles";

const W = 200;
const H = 48;
const PAD = 3;

/* Private sparkline: decorative SVG + a visually hidden text with the same values (NFR-3). */
function Sparkline({ values }: { values: number[] }) {
  const t = useTranslations("agentPerformance");
  if (values.length === 0) return null;
  const max = Math.max(...values, 1);
  const stepX = values.length > 1 ? (W - PAD * 2) / (values.length - 1) : 0;
  const pts = values.map((v, i) => [PAD + (values.length > 1 ? i * stepX : (W - PAD * 2) / 2), H - PAD - (v / max) * (H - PAD * 2)] as const);
  const last = pts[pts.length - 1]!;
  return (
    <>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={s.sparkline} aria-hidden="true" focusable="false">
        <polyline
          points={pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ")}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          vectorEffect="non-scaling-stroke"
        />
        <circle cx={last[0]} cy={last[1]} r={2} fill="currentColor" />
      </svg>
      <span style={srOnly}>{t("cards.runsSparkline", { values: values.join(", ") })}</span>
    </>
  );
}

export function TotalRunsCard({ runs, buckets, rangeLabel }: { runs: number; buckets: PerfBucket[]; rangeLabel: string }) {
  const t = useTranslations("agentPerformance");
  return (
    <section style={s.card} aria-label={t("cards.totalRuns", { range: rangeLabel })}>
      <div style={s.label}>{t("cards.totalRuns", { range: rangeLabel })}</div>
      <div style={s.value}>{runs}</div>
      <Sparkline values={buckets.map((b) => b.runs)} />
    </section>
  );
}
