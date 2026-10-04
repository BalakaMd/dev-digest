"use client";

import React from "react";
import type { TourCriticalPath, TourLanguage } from "@devdigest/shared";
import { NoData } from "../NoData";
import { PathReasonRow } from "../PathReasonRow";
import { s } from "./styles";

/** Critical paths body: up to 5 files in the order the API returns them (rank desc, path asc). */
export function CriticalPathsSection({
  items,
  language,
  fullName,
  branch,
  onRegenerate,
  regenerateDisabled,
}: {
  items: TourCriticalPath[] | null;
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
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item.path} style={s.item}>
          <PathReasonRow
            path={item.path}
            reason={item.reason}
            language={language}
            fullName={fullName}
            branch={branch}
          />
        </li>
      ))}
    </ul>
  );
}
