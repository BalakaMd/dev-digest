"use client";

import React from "react";
import type { TourFirstTask, TourLanguage } from "@devdigest/shared";
import { NoData } from "../NoData";
import { PathReasonRow } from "../PathReasonRow";
import { TourText } from "../TourText";
import { s } from "./styles";

/** First tasks body: description (tour language) plus each touched path with an Open link. */
export function FirstTasksSection({
  items,
  language,
  fullName,
  branch,
  onRegenerate,
  regenerateDisabled,
}: {
  items: TourFirstTask[] | null;
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
      {items.map((task, i) => (
        <li key={`${i}-${task.description}`} style={s.task}>
          <div style={s.description}>
            <TourText language={language}>{task.description}</TourText>
          </div>
          <div style={s.paths}>
            {task.paths.map((path) => (
              <PathReasonRow key={path} path={path} language={language} fullName={fullName} branch={branch} />
            ))}
          </div>
        </li>
      ))}
    </ul>
  );
}
