/* CoverageRing — whole-percentage ring; "—" when the value is null (no enabled
   agents). Exposes its value as text (role="img" + aria-label, plus visible text). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";

const SIZE = 38;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function CoverageRing({ pct }: { pct: number | null }) {
  const t = useTranslations("projectContext");
  const text = pct === null ? t("viewer.coverageNoneText") : `${pct}%`;
  const label = pct === null ? t("viewer.coverageNone") : t("viewer.coverageValue", { value: text });
  const filled = pct === null ? 0 : (Math.min(100, Math.max(0, pct)) / 100) * CIRC;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }}>
      <div role="img" aria-label={label} style={{ position: "relative", width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} aria-hidden="true" style={{ transform: "rotate(-90deg)" }}>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={RADIUS} fill="none" stroke="var(--border-strong)" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke="var(--ok)"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${CIRC}`}
          />
        </svg>
        <span
          aria-hidden="true"
          style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", fontSize: 11, fontWeight: 700 }}
        >
          {text}
        </span>
      </div>
      <span style={{ fontSize: 9.5, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        {t("viewer.coverage")}
      </span>
    </div>
  );
}
