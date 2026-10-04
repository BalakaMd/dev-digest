"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrBrief } from "@devdigest/shared";
import { formatCompactCount, formatCostUsd } from "../../helpers";
import { s } from "./styles";

/** "$ $0.014  8.2K→1.3K" — run cost and tokens in→out; renders nothing when neither is known. */
export function BriefCost({ brief }: { brief: Pick<PrBrief, "cost_usd" | "tokens_in" | "tokens_out"> }) {
  const t = useTranslations("brief");
  const { cost_usd, tokens_in, tokens_out } = brief;
  const hasTokens = tokens_in != null && tokens_out != null;
  if (cost_usd == null && !hasTokens) return null;
  const cost = cost_usd != null ? formatCostUsd(cost_usd) : null;
  return (
    <p style={s.line}>
      {cost != null && (
        <span style={s.cost} title={t("cost.cost")}>
          {!cost.startsWith("<") && <span aria-hidden="true">$ </span>}
          {cost}
        </span>
      )}
      {hasTokens && (
        <span title={t("cost.tokens")}>
          {formatCompactCount(tokens_in)}→{formatCompactCount(tokens_out)}
        </span>
      )}
    </p>
  );
}
