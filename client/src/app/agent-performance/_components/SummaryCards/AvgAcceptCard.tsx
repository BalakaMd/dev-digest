"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AcceptStats } from "@devdigest/shared";
import { acceptDescriptionKey, acceptTone, wholePercent } from "../../_model/accept-rate";
import { toneColor } from "../AcceptRate";
import { FocusTip } from "../FocusTip";
import { srOnly } from "../sr-only";
import { s } from "./styles";

const SIZE = 44;
const STROKE = 4;
const R = (SIZE - STROKE) / 2;
const C = 2 * Math.PI * R;

function Ring({ fraction, percent, color, description }: { fraction: number; percent: number; color: string; description?: string }) {
  const t = useTranslations("agentPerformance");
  const dash = C * Math.min(Math.max(fraction, 0), 1);
  return (
    <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={s.ring} role="img" aria-label={description ? t("cards.ringLabelQuality", { percent, quality: description }) : t("cards.ringLabel", { percent })}>
      <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="var(--border)" strokeWidth={STROKE} />
      <circle
        cx={SIZE / 2}
        cy={SIZE / 2}
        r={R}
        fill="none"
        stroke={color}
        strokeWidth={STROKE}
        strokeLinecap="round"
        strokeDasharray={`${dash} ${C}`}
        transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
      />
      <text x="50%" y="50%" textAnchor="middle" dominantBaseline="central" fontSize={12} fontWeight={700} fill="var(--text-primary)">
        {percent}
      </text>
    </svg>
  );
}

export function AvgAcceptCard({ accept }: { accept: AcceptStats }) {
  const t = useTranslations("agentPerformance");
  const hasRate = accept.rate != null && accept.decisions > 0;
  const tone = acceptTone(accept);
  const descKey = acceptDescriptionKey(tone);
  const percent = hasRate ? wholePercent(accept.rate as number) : 0;
  return (
    <section style={s.card} aria-label={t("cards.avgAccept")}>
      <div style={s.head}>
        <div style={s.label}>{t("cards.avgAccept")}</div>
        {hasRate ? <Ring fraction={accept.rate as number} percent={percent} color={toneColor(tone)} description={descKey ? t(`accept.${descKey}`) : undefined} /> : null}
      </div>
      {hasRate ? (
        <>
          <FocusTip focusable={!!descKey} lines={descKey ? [t(`accept.${descKey}`)] : []} style={{ display: "block" }}>
          <div style={s.valueRow} title={descKey ? t(`accept.${descKey}`) : undefined} data-tone={tone}>
            <span style={{ ...s.value, color: toneColor(tone) }}>
              {percent}
              <span style={s.unit}>%</span>
            </span>
            {descKey ? <span style={srOnly}>{t(`accept.${descKey}`)}</span> : null}
            {accept.low_sample ? <span style={s.muted}>{t("cards.lowSample")}</span> : null}
          </div>
          </FocusTip>
          <div style={s.muted}>{t("cards.ofDecisions", { count: accept.decisions })}</div>
        </>
      ) : (
        <>
          <div style={s.value}>{t("dash")}</div>
          <div style={s.muted}>{t("cards.noDecisions")}</div>
        </>
      )}
      <p style={s.note}>{t("cards.localOnly")}</p>
    </section>
  );
}
