/* ContextDocPreviewDrawer — the preview inside the shared right-hand Drawer. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Drawer } from "@devdigest/ui";
import { ContextDocPreview, type ContextDocPreviewProps } from "./ContextDocPreview";

export function ContextDocPreviewDrawer({
  repoId,
  path,
  source,
  onClose,
}: ContextDocPreviewProps & { onClose: () => void }) {
  const t = useTranslations("contextDocs");
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Drawer title={<span className="mono">{path}</span>} subtitle={t("preview.title")} onClose={onClose}>
      <ContextDocPreview repoId={repoId} path={path} source={source} />
    </Drawer>
  );
}
