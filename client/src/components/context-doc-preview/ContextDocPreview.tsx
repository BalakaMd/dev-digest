/* ContextDocPreview — read-only rendering of one project document. Markdown
   goes through the shared `Markdown` primitive (no raw HTML; links are plain
   anchors and are never fetched by us). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { ErrorState, Markdown, Skeleton } from "@devdigest/ui";
import type { ContextDocSource } from "@devdigest/shared";
import { ApiError } from "../../lib/api";
import { useContextDocContent } from "../../lib/hooks/context-docs";

export interface ContextDocPreviewProps {
  repoId: string;
  path: string;
  source?: ContextDocSource;
}

export function ContextDocPreview({ repoId, path, source }: ContextDocPreviewProps) {
  const t = useTranslations("contextDocs");
  const doc = useContextDocContent(repoId, path, source);

  if (doc.isLoading) {
    return (
      <div aria-busy="true" aria-label={t("preview.loading")}>
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </div>
    );
  }
  if (doc.isError) {
    // The server answers 422 `validation_error` with `details.reason: "too_large"` for an
    // oversized document; anything else is a load failure.
    const details = doc.error instanceof ApiError ? (doc.error.details as { reason?: unknown } | undefined) : undefined;
    if (details?.reason === "too_large") {
      return <p role="status">{t("preview.tooLarge")}</p>;
    }
    return <ErrorState body={t("preview.loadError")} onRetry={() => void doc.refetch()} />;
  }
  if (!doc.data?.content) return <p role="status">{t("preview.empty")}</p>;
  return <Markdown>{doc.data.content}</Markdown>;
}
