"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrBrief } from "@devdigest/shared";
import { briefDiffHref } from "../../helpers";
import { s } from "../../styles";
import { BriefText, BriefCode } from "../BriefText";

/** Review focus: items in stored order, `path:line` link in monospace + reason. */
export function ReviewFocus({
  items,
  language,
  repoId,
  number,
}: {
  items: PrBrief["review_focus"];
  language: PrBrief["language"];
  repoId: string;
  number: number | string;
}) {
  const t = useTranslations("brief");
  return (
    <section style={s.section} aria-labelledby="brief-focus-heading">
      <h3 id="brief-focus-heading" style={{ ...s.heading, display: "flex", alignItems: "center", gap: 8 }}>
        <Icon.ListChecks size={14} />
        {t("block.focus")} — {t("readFirst")}
        <span style={s.count}>{items.length}</span>
      </h3>
      {items.length === 0 ? (
        <p style={s.empty}>{t("noFocus")}</p>
      ) : (
        <ul style={s.list}>
          {items.map((item, i) => (
            <li key={`${i}-${item.file}:${item.line}`} style={s.focusItem}>
              <span aria-hidden="true" style={s.focusMarker}>▸</span>
              <Link
                href={briefDiffHref(repoId, number, item.file, item.line)}
                style={s.link}
                aria-label={t("focusLinkLabel", { path: item.file, line: item.line })}
              >
                <BriefCode>{`${item.file}:${item.line}`}</BriefCode>
              </Link>
              <p style={s.reason}>
                <span aria-hidden="true">{" — "}</span>
                <BriefText language={language} style={{ ...s.wrap, display: "inline" }}>
                  {item.reason}
                </BriefText>
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
