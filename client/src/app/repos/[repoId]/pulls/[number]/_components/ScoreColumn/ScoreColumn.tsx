"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { CircularScore } from "@devdigest/ui";
import { s } from "./styles";

/**
 * Right-hand column of the PR Brief header card: score ring (or a muted placeholder when
 * there is no score), "PR SCORE" caption, then a divider and the optional `meta` (run cost).
 */
export function ScoreColumn({
  score,
  hint,
  meta,
}: {
  score: number | null;
  /** Quiet tooltip for the placeholder ring (title/aria-label only). */
  hint?: string;
  meta?: React.ReactNode;
}) {
  const t = useTranslations("prReview");
  const label = t("verdict.prScore");
  return (
    <div style={s.col}>
      {score != null ? (
        <CircularScore score={score} size={52} stroke={5} />
      ) : (
        <div
          style={s.ring}
          role="img"
          title={hint}
          aria-label={hint ? `${label}: ${hint}` : label}
        >
          <span aria-hidden="true">—</span>
        </div>
      )}
      <span style={s.label}>{label}</span>
      {meta && <div style={s.meta}>{meta}</div>}
    </div>
  );
}
