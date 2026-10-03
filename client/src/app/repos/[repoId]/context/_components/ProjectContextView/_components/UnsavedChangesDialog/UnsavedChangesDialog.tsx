/* UnsavedChangesDialog — "discard or keep editing" prompt (AC-74). Closing it
   (✕ / backdrop) counts as keep editing. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export function UnsavedChangesDialog({ onDiscard, onKeep }: { onDiscard: () => void; onKeep: () => void }) {
  const t = useTranslations("projectContext.unsaved");
  return createPortal(
    <Modal
      width={440}
      title={t("title")}
      onClose={onKeep}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="danger" onClick={onDiscard}>
            {t("discard")}
          </Button>
          <Button kind="primary" onClick={onKeep}>
            {t("keep")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        {t("body")}
      </div>
    </Modal>,
    document.body,
  );
}
