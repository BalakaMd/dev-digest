/* CaseEditorModal — create / edit one eval case (SPEC-06 AC-46…54, 75).
   `caseId` null = a new case; otherwise the stored case is loaded first. This
   shell only loads; `CaseEditorForm` owns the editing state. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";
import type { Agent } from "@devdigest/shared";
import { useEvalCase } from "../../../../../../../../../lib/hooks/eval";
import { CaseEditorForm } from "./CaseEditorForm";
import { s } from "./styles";

export function CaseEditorModal({
  agent,
  caseId,
  onClose,
}: {
  agent: Agent;
  /** null = create a new case. */
  caseId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const stored = useEvalCase(caseId);

  if (caseId === null) return <CaseEditorForm agent={agent} stored={null} onClose={onClose} />;
  if (stored.data) return <CaseEditorForm agent={agent} stored={stored.data} onClose={onClose} />;

  return createPortal(
    <Modal
      width={520}
      title={t("caseTitle", { name: "…" })}
      onClose={onClose}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Button kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
        </div>
      }
    >
      {stored.isError ? (
        <div role="alert" style={s.state}>
          {t("loadFailed")}: {stored.error.message}
        </div>
      ) : (
        <div role="status" aria-busy="true" style={s.state}>
          {t("loadingCase")}
        </div>
      )}
    </Modal>,
    document.body,
  );
}
