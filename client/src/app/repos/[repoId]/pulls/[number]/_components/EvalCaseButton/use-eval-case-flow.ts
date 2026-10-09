/* use-eval-case-flow.ts — state machine of "Turn into eval case" (SPEC-07):
   suggestion request → (equal range: create at once | differs: range dialog) → create.
   Handlers, not effects, drive the flow; the one effect only returns focus when the dialog closes. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { EvalCaseSuggestionDetail, EvalLineRange } from "@devdigest/shared";
import { useCaseFromFinding, useEvalCaseSuggestion } from "../../../../../../../lib/hooks/eval";
import { ApiError } from "../../../../../../../lib/api";
import { notify } from "../../../../../../../lib/toast";
import { sameRange } from "./range-model";

/** Error code of `POST /findings/:id/eval-case` when the diff changed under the dialog (AC-43). */
const DIFF_CHANGED = "diff_changed";

export function useEvalCaseFlow(findingId: string) {
  const t = useTranslations("prReview");
  const suggest = useEvalCaseSuggestion(findingId);
  const create = useCaseFromFinding(findingId);
  /** Non-null = the range dialog is open on this suggestion. */
  const [dialog, setDialog] = React.useState<EvalCaseSuggestionDetail | null>(null);
  /** A case that already existed when the suggestion was requested (AC-35). */
  const [existing, setExisting] = React.useState<{ id: string; name: string } | null>(null);
  const trigger = React.useRef<HTMLElement | null>(null);
  const open = dialog !== null;

  // Return focus to the trigger once the dialog has closed (AC-2, NFR-5).
  const wasOpen = React.useRef(false);
  React.useEffect(() => {
    if (wasOpen.current && !open) trigger.current?.focus();
    wasOpen.current = open;
  }, [open]);

  const message = (err: Error | null) => (err ? err.message || t("finding.evalCase.failed") : null);

  const announceCreated = (res: { created: boolean; case: { name: string } }) => {
    if (res.created) notify.success(t("finding.evalCase.created", { name: res.case.name }));
  };

  /** Request a suggestion; `onDetail` decides what to do with a fresh one. */
  const requestSuggestion = (onDetail: (s: EvalCaseSuggestionDetail) => void) =>
    suggest.mutate(undefined, {
      onSuccess: (res) => {
        if (res.existing_case) {
          setDialog(null);
          setExisting(res.existing_case);
        } else if (res.suggestion) {
          onDetail(res.suggestion);
        }
      },
    });

  const start = (el: HTMLElement) => {
    trigger.current = el;
    create.reset();
    requestSuggestion((s) => {
      if (sameRange(s.cited, s.suggested)) create.mutate(undefined, { onSuccess: announceCreated });
      else setDialog(s);
    });
  };

  const confirm = (range: EvalLineRange) => {
    if (!dialog) return;
    create.mutate(
      { ...range, patch_fingerprint: dialog.patch_fingerprint },
      {
        onSuccess: (res) => {
          setDialog(null);
          announceCreated(res);
        },
        onError: (err) => {
          // The patch changed: reload the suggestion, the dialog keeps the typed numbers (AC-43).
          if (err instanceof ApiError && err.code === DIFF_CHANGED) requestSuggestion(setDialog);
        },
      },
    );
  };

  const cancel = () => {
    setDialog(null);
    create.reset();
  };

  return {
    start,
    confirm,
    cancel,
    dialog,
    existing,
    result: create.data,
    /** The trigger button is busy: asking for the suggestion, or creating on a single activation (AC-26). */
    busy: suggest.isPending || (create.isPending && !open),
    /** The dialog's confirm (or a reload after a changed diff) is in flight (AC-19). */
    dialogPending: create.isPending || suggest.isPending,
    /** Failure shown next to the button (AC-27); hidden while the dialog shows its own. */
    buttonError: open ? null : message(suggest.error ?? create.error),
    /** Failure shown in the dialog (AC-15, AC-17). */
    dialogError: open ? message(create.error ?? suggest.error) : null,
  };
}
