/* CopyStatus — "Repository changed" badge plus "Keep my copy" for an override copy whose
   repository original changed since the copy was made (AC-21, AC-22). The copy stays the
   effective document either way; keeping it only records the new origin on the server. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useKeepLocalCopy } from "@/lib/hooks/context-docs";

export function CopyStatus({ repoId, path, onKept }: { repoId: string; path: string; onKept: () => void }) {
  const t = useTranslations("projectContext");
  const keep = useKeepLocalCopy(repoId);
  return (
    <>
      <span
        title={t("tree.repoChangedTitle")}
        style={{
          fontSize: 11,
          fontWeight: 600,
          padding: "2px 7px",
          borderRadius: 5,
          border: "1px solid var(--border-strong)",
          color: "var(--text-secondary)",
        }}
      >
        {t("viewer.repoChanged")}
      </span>
      <Button
        kind="ghost"
        size="sm"
        icon="Check"
        aria-label={t("viewer.keepCopyLabel", { path })}
        loading={keep.isPending}
        disabled={keep.isPending}
        onClick={() => keep.mutate(path, { onSuccess: onKept })}
      >
        {t("viewer.keepCopy")}
      </Button>
      {keep.isError && (
        <span role="alert" style={{ fontSize: 12, color: "var(--crit)" }}>
          {t("viewer.keepCopyFailed")}
        </span>
      )}
    </>
  );
}
