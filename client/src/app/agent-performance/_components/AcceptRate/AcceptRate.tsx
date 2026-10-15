/* AcceptRate — "78% · 45/58" coloured by quality (AC-68), "Low sample" label (AC-32),
   "—" for no rate (AC-31). The quality text is in `title` and in visually hidden text,
   so colour never carries the meaning alone (NFR-3). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { AcceptStats } from "@devdigest/shared";
import { acceptDescriptionKey, acceptTone, wholePercent } from "../../_model/accept-rate";
import { FocusTip } from "../FocusTip";
import { srOnly } from "../sr-only";
import { s } from "./styles";

export type AcceptRateProps = {
  accept: Pick<AcceptStats, "rate" | "accepted" | "decisions" | "low_sample">;
  /** Make the value a tab stop that shows the quality text on focus — only where it is not
   *  inside another interactive element (AC-68, NFR-3). */
  focusable?: boolean;
  /** Where the focus bubble opens; "top" inside table rows (scroll wrapper clips below). */
  tipPlacement?: "bottom" | "top";
};

export function AcceptRate({ accept, focusable = false, tipPlacement }: AcceptRateProps) {
  const t = useTranslations("agentPerformance");
  const tone = acceptTone(accept);
  if (accept.rate == null) {
    return <span style={s.root("none")}>{t("dash")}</span>;
  }
  const descKey = acceptDescriptionKey(tone);
  const description = descKey ? t(`accept.${descKey}`) : undefined;
  const body = (
    <span style={s.root(tone)} title={description} data-tone={tone}>
      <span>
        {t("accept.cell", {
          percent: wholePercent(accept.rate),
          accepted: accept.accepted,
          decisions: accept.decisions,
        })}
      </span>
      {description ? <span style={srOnly}>{description}</span> : null}
      {accept.low_sample ? <span style={s.lowSample}>{t("accept.lowSample")}</span> : null}
    </span>
  );
  if (!focusable || !description) return body;
  return (
    <FocusTip focusable placement={tipPlacement} lines={[description]}>
      {body}
    </FocusTip>
  );
}
