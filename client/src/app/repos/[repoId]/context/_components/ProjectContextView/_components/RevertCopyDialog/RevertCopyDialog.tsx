/* RevertCopyDialog — confirms "Revert to repository version" (AC-14): the copy's edits are
   discarded and the listed agents and skills use the repository document again. Confirming
   deletes the local copy; attachments stay unchanged. Names render as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { useContextDocUsage, useDeleteLocalDoc } from "@/lib/hooks/context-docs";
import { AttachedBy } from "../AttachedBy";

export function RevertCopyDialog({
  repoId,
  path,
  onReverted,
  onClose,
}: {
  repoId: string;
  path: string;
  onReverted: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("projectContext.revert");
  const usage = useContextDocUsage(repoId, path);
  const del = useDeleteLocalDoc(repoId);
  const [error, setError] = React.useState<string | null>(null);

  const confirm = () => {
    setError(null);
    del.mutate(path, {
      onSuccess: onReverted,
      onError: (err) => setError(err instanceof Error ? err.message : t("failed")),
    });
  };

  const agents = usage.data?.attached_by_agents ?? [];
  const skills = usage.data?.attached_by_skills ?? [];
  const attached = agents.length + skills.length > 0;
  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, overflowWrap: "anywhere" }}>{t("body", { path })}</p>
      {usage.isLoading && <p style={{ margin: 0 }}>{t("usageLoading")}</p>}
      {usage.isError && <p style={{ margin: 0 }}>{t("usageError")}</p>}
      {usage.data && !attached && <p style={{ margin: 0 }}>{t("noneAttached")}</p>}
      {usage.data && attached && (
        <div>
          <p style={{ margin: "0 0 4px" }}>{t("attachedIntro")}</p>
          <AttachedBy agents={agents} skills={skills} />
        </div>
      )}
      {error && (
        <p role="alert" style={{ margin: 0, color: "var(--crit)" }}>
          {error}
        </p>
      )}
    </div>
  );

  return (
    <ConfirmDialog
      title={t("title")}
      body={body}
      confirmLabel={t("confirm")}
      pending={del.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
