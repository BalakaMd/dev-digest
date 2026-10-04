"use client";

import React from "react";
import type { TourLanguage, TourReadingStep } from "@devdigest/shared";
import { NoData } from "../NoData";
import { PathReasonRow } from "../PathReasonRow";
import { s } from "./styles";

/** Guided reading path body: files numbered from 1 in API order; numbers stay LTR. */
export function ReadingPathSection({
  items,
  language,
  fullName,
  branch,
  onRegenerate,
  regenerateDisabled,
}: {
  items: TourReadingStep[] | null;
  language: TourLanguage;
  fullName: string;
  branch: string;
  onRegenerate: () => void;
  regenerateDisabled?: boolean;
}) {
  if (!items || items.length === 0) {
    return <NoData onRegenerate={onRegenerate} regenerateDisabled={regenerateDisabled} />;
  }
  return (
    <ol style={s.list}>
      {items.map((item, i) => (
        <li key={item.path} style={s.item}>
          <PathReasonRow
            path={item.path}
            reason={item.reason}
            language={language}
            fullName={fullName}
            branch={branch}
            leading={<span dir="ltr">{i + 1}.</span>}
          />
        </li>
      ))}
    </ol>
  );
}
