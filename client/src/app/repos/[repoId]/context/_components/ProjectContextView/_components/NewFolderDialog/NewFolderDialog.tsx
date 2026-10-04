/* NewFolderDialog — creates an (empty) local folder (AC-69). A path the server
   rejects (outside the search roots, on a repository path) shows its reason. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput } from "@devdigest/ui";
import { useCreateLocalFolder } from "@/lib/hooks/context-docs";

export function NewFolderDialog({
  repoId,
  onCreated,
  onClose,
}: {
  repoId: string;
  onCreated: (path: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations("projectContext.newFolder");
  const create = useCreateLocalFolder(repoId);
  const [path, setPath] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = path.trim().replace(/^\/+|\/+$/g, "");
    if (!clean) return setError(t("errorPath"));
    setError(null);
    create.mutate(clean, {
      onSuccess: () => onCreated(clean),
      onError: (err) => setError(err instanceof Error ? err.message : t("failed")),
    });
  };

  return createPortal(
    <Modal width={460} title={t("title")} onClose={onClose}>
      <form onSubmit={submit} style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13 }}>
          {t("path")}
          <TextInput
            mono
            autoFocus
            value={path}
            onChange={(v) => {
              setPath(v);
              setError(null);
            }}
            placeholder={t("pathPlaceholder")}
            aria-label={t("path")}
            aria-invalid={error !== null}
          />
        </label>
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--crit)" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" kind="ghost" onClick={onClose} disabled={create.isPending}>
            {t("cancel")}
          </Button>
          <Button type="submit" kind="primary" loading={create.isPending} disabled={create.isPending}>
            {t("create")}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
