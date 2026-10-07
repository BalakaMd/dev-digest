"use client";

import React, { useId, useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { briefDiffHref } from "../../helpers";
import { s } from "../../styles";
import { BriefText, BriefCode } from "../BriefText";

type Risk = PrBrief["risks"][number];

function RiskRow({ risk, repoId, number, language }: { risk: Risk; repoId: string; number: number | string; language: PrBrief["language"] }) {
  const t = useTranslations("brief");
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <li style={s.risk}>
      <div style={s.riskHead}>
        <Icon.AlertTriangle size={14} style={s.riskIcon(risk.severity)} />
        <div style={s.riskMain}>
          <BriefText language={language} style={{ ...s.wrap, fontWeight: 600, fontSize: 13 }}>
            {risk.title}
          </BriefText>
          <ul style={s.refs}>
            {risk.file_refs.map((file) => (
              <li key={file}>
                <Link href={briefDiffHref(repoId, number, file)} style={s.link}>
                  <BriefCode>{file}</BriefCode>
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <span style={s.severity}>{t(`severity.${risk.severity}`)}</span>
        <button
          type="button"
          style={s.riskToggle}
          aria-expanded={open}
          aria-controls={panelId}
          aria-label={`${open ? t("collapseRisk") : t("expandRisk")}: ${risk.title}`}
          onClick={() => setOpen((v) => !v)}
        >
          <Icon.ChevronDown size={14} style={s.chevron(open)} />
        </button>
      </div>
      <p id={panelId} hidden={!open} style={s.explanation}>
        <BriefText language={language} style={s.wrap}>
          {risk.explanation}
        </BriefText>
      </p>
    </li>
  );
}

/** Risk areas: rows in stored order; model text as plain text nodes, links only from grounded paths. */
export function RiskAreas({
  risks,
  language,
  repoId,
  number,
}: {
  risks: PrBrief["risks"];
  language: PrBrief["language"];
  repoId: string;
  number: number | string;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.section} aria-labelledby="brief-risks-heading">
      <h3 id="brief-risks-heading" style={s.heading}>
        {t("block.risks")}
      </h3>
      {risks.length === 0 ? (
        <p style={s.empty}>{t("noRisks")}</p>
      ) : (
        <ul style={s.list}>
          {risks.map((risk, i) => (
            <RiskRow key={`${i}-${risk.title}`} risk={risk} repoId={repoId} number={number} language={language} />
          ))}
        </ul>
      )}
    </section>
  );
}
