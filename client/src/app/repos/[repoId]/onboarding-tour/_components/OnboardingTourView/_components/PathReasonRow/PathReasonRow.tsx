import React from "react";
import type { TourLanguage } from "@devdigest/shared";
import { TourCode, TourText } from "../TourText";
import { OpenButton } from "../OpenButton";
import { s } from "./styles";

/**
 * One file line. DOM (and focus) order is always path → Open → reason, whatever
 * the tour language; only the reason carries the language direction (AC-45).
 */
export function PathReasonRow({
  path,
  reason,
  language,
  fullName,
  branch,
  leading,
}: {
  path: string;
  reason?: string | null;
  language: TourLanguage;
  fullName: string;
  branch: string;
  leading?: React.ReactNode;
}) {
  return (
    <div dir="ltr" style={s.row}>
      <div style={s.head}>
        {leading ? <span style={s.leading}>{leading}</span> : null}
        <TourCode style={s.path}>{path}</TourCode>
        <OpenButton fullName={fullName} branch={branch} path={path} />
      </div>
      {reason ? (
        <div style={s.reason}>
          <TourText language={language}>{reason}</TourText>
        </div>
      ) : null}
    </div>
  );
}
