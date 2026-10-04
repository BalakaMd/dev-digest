"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { TourCode } from "../TourText";
import { CopyButton } from "../CopyButton";
import { s } from "./styles";

/** How to run locally: numbered monospace commands, each with a copy button, plus "Copy all". */
export function RunSection({
  commands,
  announce,
}: {
  commands: string[];
  announce: (message: string) => void;
}) {
  const t = useTranslations("onboardingSections");
  if (commands.length === 0) {
    return <span style={s.empty}>{t("run.empty")}</span>;
  }
  return (
    <div style={s.root}>
      <div style={s.toolbar}>
        <CopyButton text={commands.join("\n")} label={t("run.copyAll")} announce={announce}>
          {t("run.copyAll")}
        </CopyButton>
      </div>
      <ol dir="ltr" style={s.list}>
        {commands.map((command, i) => (
          <li key={`${i}-${command}`} style={s.item}>
            <span style={s.number}>{i + 1}.</span>
            <TourCode style={s.command}>{command}</TourCode>
            <CopyButton text={command} label={t("run.copyCommand", { n: i + 1 })} announce={announce} />
          </li>
        ))}
      </ol>
    </div>
  );
}
