/* ConfirmPanel — inline two-button confirmation shown inside the wizard dialog
   (instead of a stacked modal): "Discard your workflow edits?" (AC-72) and
   "Replace your workflow edits?" (AC-16). Wizard state stays untouched behind it. */
"use client";

import React from "react";
import { Button } from "@devdigest/ui";
import { s } from "./styles";

export function ConfirmPanel({
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
}: {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const titleId = React.useId();
  return (
    <div role="alertdialog" aria-labelledby={titleId} style={s.confirm}>
      <h3 id={titleId} style={s.confirmTitle}>
        {title}
      </h3>
      {body && <p style={s.confirmBody}>{body}</p>}
      <div style={s.actions}>
        <Button kind="danger" onClick={onConfirm}>
          {confirmLabel}
        </Button>
        <Button data-autofocus onClick={onCancel}>
          {cancelLabel}
        </Button>
      </div>
    </div>
  );
}
