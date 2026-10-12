/* ExportWizard — the "Export to CI" dialog: own shell (role=dialog, aria-modal, named,
   focus trap, Escape, focus return), the Stepper and the registered step. Steps live in
   steps/registry.ts, the state in useExportWizard (contract: WizardProps, AC-1…AC-4, AC-72). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import { useActiveRepo } from "../../../../../../../../../lib/repo-context";
import type { WizardProps } from "../../constants";
import { ConfirmPanel } from "./ConfirmPanel";
import { Stepper } from "./Stepper";
import { STEPS } from "./steps/registry";
import { STEP_IDS, type StepId } from "./constants";
import { s } from "./styles";
import { useDialogFocus } from "./useDialogFocus";
import { useExportWizard } from "./useExportWizard";

const REGISTERED = STEP_IDS.filter((id) => STEPS[id]) as readonly StepId[];

/** What the inline confirmation is asking, if anything. */
type Pending = "discard" | "replace" | null;

export function ExportWizard({ agent, initial, onClose }: WizardProps) {
  const t = useTranslations("ci.exportWizard");
  const { activeRepo, repos, reposLoaded } = useActiveRepo();
  // The stored repo id can be stale (not in the list): fall back to the first repository once loaded.
  const defaultRepo = activeRepo?.full_name ?? (reposLoaded ? (repos[0]?.full_name ?? null) : null);
  const wizard = useExportWizard({
    agent,
    initial,
    registered: REGISTERED,
    defaultRepo,
  });
  const [pending, setPending] = React.useState<Pending>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);
  const titleId = React.useId();
  const reasonId = React.useId();
  const { state } = wizard;
  const step = STEPS[state.step];

  // Close (button / Escape): ask first when workflow edits would be lost (AC-72, AC-4).
  // With a question open, Escape answers it with the safe choice ("Keep editing").
  const requestClose = () => {
    if (wizard.installing) return; // an install request is in flight: closing would hide its outcome
    if (pending) setPending(null);
    else if (wizard.edited && !wizard.install.isSuccess) setPending("discard");
    else onClose();
  };
  useDialogFocus(dialogRef, requestClose);

  // Keep keyboard focus inside the dialog when the step changes.
  React.useEffect(() => {
    const root = dialogRef.current;
    if (root && !root.contains(document.activeElement)) {
      (root.querySelector<HTMLElement>("[data-autofocus]") ?? root).focus();
    }
  }, [state.step, pending]);

  const advance = async () => {
    if (state.step === "configure" && wizard.stale) {
      if (wizard.edited) return setPending("replace");
      try {
        await wizard.regenerate();
      } catch {
        return; // stays on Configure; the error is shown below
      }
    }
    wizard.goNext();
  };
  const replaceEdits = async () => {
    setPending(null);
    try {
      await wizard.regenerate();
    } catch {
      return;
    }
    wizard.goNext();
  };
  const keepEdits = () => {
    setPending(null);
    wizard.goNext();
  };

  if (!step) return null;
  const Step = step.Component;
  const blocked = wizard.blockReason !== null || wizard.regenerating;

  return createPortal(
    <div style={s.overlay}>
      <div style={s.backdrop} aria-hidden />
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby={titleId} tabIndex={-1} style={s.dialog}>
        <div style={s.header}>
          <div style={s.headerText}>
            <h2 id={titleId} style={s.title}>
              {t("title")}
            </h2>
            <p style={s.subtitle}>{t("subtitle", { agentName: agent.name || t("thisAgent") })}</p>
          </div>
          <button type="button" style={s.closeBtn} aria-label={t("close")} title={t("close")} disabled={wizard.installing} onClick={requestClose}>
            <Icon.X size={16} aria-hidden />
          </button>
        </div>
        <div style={s.stepperWrap}>
          <Stepper current={state.step} />
        </div>

        <div style={s.body}>
          {pending === "discard" ? (
            <ConfirmPanel
              title={t("discard.title")}
              body={t("discard.body")}
              confirmLabel={t("discard.confirm")}
              cancelLabel={t("discard.keep")}
              onConfirm={onClose}
              onCancel={() => setPending(null)}
            />
          ) : pending === "replace" ? (
            <ConfirmPanel
              title={t("replace.title")}
              body={t("replace.body")}
              confirmLabel={t("replace.confirm")}
              cancelLabel={t("replace.keep")}
              onConfirm={replaceEdits}
              onCancel={keepEdits}
            />
          ) : (
            <Step agent={agent} wizard={wizard} onClose={onClose} />
          )}
          {wizard.regenerateError && !pending && (
            <div role="alert" style={s.error}>
              {t("regenerateError")}
            </div>
          )}
        </div>

        {!step.ownFooter && !pending && (
          <div style={s.footer}>
            {!wizard.isFirst && (
              <Button icon="ChevronLeft" disabled={wizard.regenerating} onClick={wizard.goBack}>
                {t("back")}
              </Button>
            )}
            <span style={s.footerSpacer} />
            {wizard.blockReason && (
              <span id={reasonId} style={s.reason}>
                {t(`blocked.${wizard.blockReason}`)}
              </span>
            )}
            {state.step !== "install" && (
              <Button
                kind="primary"
                iconRight="ArrowRight"
                disabled={blocked}
                loading={wizard.regenerating}
                aria-describedby={wizard.blockReason ? reasonId : undefined}
                onClick={advance}
              >
                {t("continue")}
              </Button>
            )}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
