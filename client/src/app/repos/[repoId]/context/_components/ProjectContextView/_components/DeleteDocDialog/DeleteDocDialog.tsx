/* DeleteDocDialog — confirms removing a local document or an empty local
   folder (AC-86). For a document it lists the agents and skills that attach the
   path; those attachments stay and show as "Missing". Names render as text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ConfirmDialog } from "@/components/confirm-dialog";
import {
  useContextDocUsage,
  useDeleteLocalDoc,
  useDeleteLocalFolder,
} from "@/lib/hooks/context-docs";
import { AttachedBy } from "../AttachedBy";

export interface DeleteTarget {
  kind: "doc" | "folder";
  path: string;
}

export function DeleteDocDialog({
  repoId,
  target,
  onDeleted,
  onClose,
}: {
  repoId: string;
  target: DeleteTarget;
  onDeleted: () => void;
  onClose: () => void;
}) {
  const t = useTranslations("projectContext.delete");
  const isDoc = target.kind === "doc";
  const usage = useContextDocUsage(repoId, isDoc ? target.path : null);
  const delDoc = useDeleteLocalDoc(repoId);
  const delFolder = useDeleteLocalFolder(repoId);
  const del = isDoc ? delDoc : delFolder;
  const [error, setError] = React.useState<string | null>(null);

  const confirm = () => {
    setError(null);
    del.mutate(target.path, {
      onSuccess: onDeleted,
      onError: (err) => setError(err instanceof Error ? err.message : t("failed")),
    });
  };

  const agents = usage.data?.attached_by_agents ?? [];
  const skills = usage.data?.attached_by_skills ?? [];
  const body = (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <p style={{ margin: 0, overflowWrap: "anywhere" }}>
        {t(isDoc ? "docBody" : "folderBody", { path: target.path })}
      </p>
      {isDoc && usage.isLoading && <p style={{ margin: 0 }}>{t("usageLoading")}</p>}
      {isDoc && usage.isError && <p style={{ margin: 0 }}>{t("usageError")}</p>}
      {isDoc && usage.data && agents.length + skills.length === 0 && <p style={{ margin: 0 }}>{t("noneAttached")}</p>}
      {isDoc && usage.data && agents.length + skills.length > 0 && (
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
      title={t(isDoc ? "docTitle" : "folderTitle")}
      body={body}
      confirmLabel={t("confirm")}
      pending={del.isPending}
      onConfirm={confirm}
      onCancel={onClose}
    />
  );
}
