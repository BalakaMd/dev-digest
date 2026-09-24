/* ConfirmDialog — a modal that asks before an irreversible action. Three ways
   out: Confirm, Cancel, or the modal's ✕ / backdrop (both count as cancel).
   `tone="danger"` (default) is for destructive actions; "primary" for the rest.
   Portalled to <body> so an ancestor's opacity/overflow (e.g. a disabled card)
   never bleeds into the dialog. React events still bubble to the caller. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal } from "@devdigest/ui";

export function ConfirmDialog({
  title,
  body,
  confirmLabel,
  tone = "danger",
  pending,
  onConfirm,
  onCancel,
}: {
  title: string;
  body: React.ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslations("common");
  return createPortal(
    <Modal
      width={440}
      title={title}
      onClose={onCancel}
      footer={
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button kind="ghost" onClick={onCancel} disabled={pending}>
            {t("actions.cancel")}
          </Button>
          <Button
            kind={tone}
            icon={tone === "danger" ? "Trash" : "Check"}
            onClick={onConfirm}
            loading={pending}
            disabled={pending}
          >
            {confirmLabel ?? t("actions.confirm")}
          </Button>
        </div>
      }
    >
      <div style={{ padding: "18px 24px", fontSize: 14, lineHeight: 1.5, color: "var(--text-secondary)" }}>
        {body}
      </div>
    </Modal>,
    document.body,
  );
}
