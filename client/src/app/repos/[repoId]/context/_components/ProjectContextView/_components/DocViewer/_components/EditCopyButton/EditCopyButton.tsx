/* EditCopyButton — "Edit a copy" of a repository document (AC-4, AC-5). Fetches the
   repository text fresh and hands it to the page, which opens the editor at once (no dialog);
   the copy exists only after its first Save. Disabled with the reason as its accessible
   description when the document is too large or not valid UTF-8 (AC-8). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@devdigest/ui";
import type { ContextDocEntry } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { fetchContextDocContent, useContextDocContent } from "@/lib/hooks/context-docs";

export interface CopySeed {
  initialText: string;
  originVersion: string;
}

const isNotUtf8 = (err: unknown) =>
  err instanceof ApiError && (err.details as { reason?: unknown } | undefined)?.reason === "not_utf8";

export function EditCopyButton({
  repoId,
  doc,
  onEditCopy,
}: {
  repoId: string;
  doc: ContextDocEntry;
  onEditCopy: (seed: CopySeed) => void;
}) {
  const t = useTranslations("projectContext.viewer");
  const qc = useQueryClient();
  const descId = React.useId();
  // Same query the preview issues, so the not-UTF-8 verdict costs no extra request.
  const content = useContextDocContent(repoId, doc.too_large ? null : doc.path, "repo");
  const [loading, setLoading] = React.useState(false);
  const [failure, setFailure] = React.useState<"not_utf8" | "failed" | null>(null);

  const notUtf8 = failure === "not_utf8" || isNotUtf8(content.error);
  const reason = doc.too_large ? t("editCopyTooLarge") : notUtf8 ? t("editCopyNotUtf8") : null;

  const open = async () => {
    setFailure(null);
    setLoading(true);
    try {
      const fresh = await fetchContextDocContent(qc, repoId, doc.path, "repo");
      onEditCopy({ initialText: fresh.content, originVersion: fresh.version });
    } catch (err) {
      setFailure(isNotUtf8(err) ? "not_utf8" : "failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Button
        kind="ghost"
        size="sm"
        icon="Edit"
        aria-label={t("editCopyLabel", { path: doc.path })}
        aria-describedby={descId}
        disabled={!!reason || loading}
        loading={loading}
        onClick={() => void open()}
      >
        {t("editCopy")}
      </Button>
      <span id={descId} style={{ fontSize: 12, color: "var(--text-muted)" }}>
        {reason ?? t("editCopyHint")}
      </span>
      {failure === "failed" && (
        <span role="alert" style={{ fontSize: 12, color: "var(--crit)" }}>
          {t("editCopyFailed", { path: doc.path })}
        </span>
      )}
    </>
  );
}
