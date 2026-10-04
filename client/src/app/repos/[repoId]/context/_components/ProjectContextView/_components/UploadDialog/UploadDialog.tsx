/* UploadDialog — uploads markdown files into a local folder (AC-70). Files are
   read as base64 and posted in one request; the server validates each file and
   the dialog lists every rejected one by name with its reason. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput } from "@devdigest/ui";
import type { LocalDocUploadResult } from "@devdigest/shared";
import { useUploadLocalDocs } from "@/lib/hooks/context-docs";

const MAX_FILES = 50;

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error ?? new Error(file.name));
    reader.readAsDataURL(file);
  });
}

export function UploadDialog({
  repoId,
  defaultFolder,
  onDone,
  onClose,
}: {
  repoId: string;
  defaultFolder: string;
  /** Called after the request succeeded (even when some files were rejected). */
  onDone: (result: LocalDocUploadResult) => void;
  onClose: () => void;
}) {
  const t = useTranslations("projectContext.upload");
  const upload = useUploadLocalDocs(repoId);
  const [folder, setFolder] = React.useState(defaultFolder);
  const [files, setFiles] = React.useState<File[]>([]);
  const [error, setError] = React.useState<string | null>(null);
  const [result, setResult] = React.useState<LocalDocUploadResult | null>(null);
  const [reading, setReading] = React.useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return setError(t("noFiles"));
    if (files.length > MAX_FILES) return setError(t("tooMany"));
    setError(null);
    setReading(true);
    let encoded: { name: string; content_b64: string }[];
    try {
      encoded = await Promise.all(files.map(async (f) => ({ name: f.name, content_b64: await readBase64(f) })));
    } catch {
      setReading(false);
      return setError(t("failed"));
    }
    setReading(false);
    upload.mutate(
      { folder: folder.trim().replace(/^\/+|\/+$/g, ""), files: encoded },
      {
        onSuccess: (res) => {
          setResult(res);
          onDone(res);
        },
        onError: (err) => setError(err instanceof Error ? err.message : t("failed")),
      },
    );
  };

  const busy = reading || upload.isPending;
  return createPortal(
    <Modal width={500} title={t("title")} onClose={onClose}>
      <form onSubmit={(e) => void submit(e)} style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {!result && (
          <>
            <label style={{ fontSize: 13 }}>
              {t("folder")}
              <TextInput mono value={folder} onChange={setFolder} aria-label={t("folder")} />
            </label>
            <label style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
              {t("files")}
              <input
                type="file"
                multiple
                accept=".md,text/markdown"
                aria-label={t("files")}
                onChange={(e) => {
                  setFiles(Array.from(e.target.files ?? []));
                  setError(null);
                }}
              />
            </label>
          </>
        )}
        {result && (
          <div role="status" style={{ fontSize: 13 }}>
            <p style={{ margin: "0 0 6px" }}>{t("stored", { count: result.stored.length })}</p>
            {result.rejected.length > 0 && (
              <>
                <strong>{t("rejectedTitle")}</strong>
                <ul style={{ margin: "4px 0 0", paddingLeft: 18 }}>
                  {result.rejected.map((r) => (
                    <li key={r.name} className="mono" style={{ fontSize: 12.5, overflowWrap: "anywhere" }}>
                      {t("rejectedItem", { name: r.name, reason: r.reason })}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}
        {error && (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--crit)" }}>
            {error}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" kind="ghost" onClick={onClose} disabled={busy}>
            {t("close")}
          </Button>
          {!result && (
            <Button type="submit" kind="primary" icon="Upload" loading={busy} disabled={busy}>
              {t("submit")}
            </Button>
          )}
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
