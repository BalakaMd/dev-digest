/* AttachedBy — names of the agents and skills that attach a document path.
   Presentational, text only; shared by the copy-draft notice and the revert dialog. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { ContextDocRef } from "@devdigest/shared";

export function AttachedBy({ agents, skills }: { agents: ContextDocRef[]; skills: ContextDocRef[] }) {
  const t = useTranslations("projectContext.attachedBy");
  return (
    <div>
      {agents.length > 0 && (
        <>
          <strong>{t("agents")}</strong>
          <ul style={{ margin: "2px 0 6px", paddingLeft: 18 }}>
            {agents.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        </>
      )}
      {skills.length > 0 && (
        <>
          <strong>{t("skills")}</strong>
          <ul style={{ margin: "2px 0 0", paddingLeft: 18 }}>
            {skills.map((k) => (
              <li key={k.id}>{k.name}</li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
