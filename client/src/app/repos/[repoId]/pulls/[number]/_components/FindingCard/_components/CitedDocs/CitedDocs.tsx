/* CitedDocs — chips for the project documents a finding cites (`cited_docs`).
   Each chip is a button named with the document path; it opens the shared
   preview drawer. Renders nothing without cited docs or without a repo id. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { ContextDocPreviewDrawer } from "@/components/context-doc-preview";
import { s } from "./styles";

export function CitedDocs({ repoId, paths }: { repoId?: string | null; paths?: string[] | null }) {
  const t = useTranslations("prReview");
  const [open, setOpen] = React.useState<string | null>(null);
  if (!repoId || !paths || paths.length === 0) return null;
  return (
    <div style={s.wrap}>
      <span style={s.label}>{t("finding.citedDocs")}</span>
      {paths.map((p) => (
        <button
          key={p}
          type="button"
          className="mono"
          title={t("finding.openCitedDoc", { path: p })}
          style={s.chip}
          onClick={() => setOpen(p)}
        >
          <Icon.FileText size={12} />
          {p}
        </button>
      ))}
      {open && <ContextDocPreviewDrawer repoId={repoId} path={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
