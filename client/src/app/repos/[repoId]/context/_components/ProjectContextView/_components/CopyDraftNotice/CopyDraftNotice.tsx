/* CopyDraftNotice — shown while a copy is open in the editor before its first Save (AC-25):
   names the agents and skills attaching the path and says they use the copy from their
   next run on, or that nothing attaches it. Names render as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useContextDocUsage } from "@/lib/hooks/context-docs";
import { AttachedBy } from "../AttachedBy";

export function CopyDraftNotice({ repoId, path }: { repoId: string; path: string }) {
  const t = useTranslations("projectContext.copyNotice");
  const usage = useContextDocUsage(repoId, path);
  const agents = usage.data?.attached_by_agents ?? [];
  const skills = usage.data?.attached_by_skills ?? [];
  const attached = agents.length + skills.length > 0;
  return (
    <div
      role="note"
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        padding: "8px 12px",
        borderRadius: 7,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
        fontSize: 12.5,
        color: "var(--text-muted)",
        overflowWrap: "anywhere",
      }}
    >
      {usage.isLoading && <p style={{ margin: 0 }}>{t("loading", { path })}</p>}
      {usage.isError && <p style={{ margin: 0 }}>{t("usageError", { path })}</p>}
      {usage.data && !attached && <p style={{ margin: 0 }}>{t("noneAttached", { path })}</p>}
      {usage.data && attached && (
        <>
          <p style={{ margin: 0 }}>{t("attached", { path })}</p>
          <AttachedBy agents={agents} skills={skills} />
        </>
      )}
    </div>
  );
}
