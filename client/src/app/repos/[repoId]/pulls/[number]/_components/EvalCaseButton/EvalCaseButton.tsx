/* EvalCaseButton — "Turn into eval case" on a finding card (SPEC-06 AC-1…9, 66; SPEC-07).
   Asks the API for a line-range suggestion first: when it equals the cited range the case is
   created on that one click; otherwise the range dialog opens and nothing is created until the
   user confirms. Enabled only once the finding is accepted or dismissed, and disabled again once
   a case exists (known up front via `existingCaseName`, or from a result — AC-9); the outcome
   (created / already exists / API error) is announced in a live region and, on success, as a
   toast. Case names are rendered as text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { RangeDialog } from "./_components/RangeDialog";
import { useEvalCaseFlow } from "./use-eval-case-flow";
import { s } from "./styles";

export function EvalCaseButton({
  findingId,
  decided,
  existingCaseName,
}: {
  findingId: string;
  decided: boolean;
  /** Name of an eval case already made from this finding (from the agent's case list). */
  existingCaseName?: string | null;
}) {
  const t = useTranslations("prReview");
  const hintId = React.useId();
  const flow = useEvalCaseFlow(findingId);
  const result = flow.result;
  const existingName = result?.case.name ?? flow.existing?.name ?? existingCaseName ?? null;
  const statusId = `${hintId}-status`;
  const describedBy = existingName ? statusId : decided ? undefined : hintId;
  const failure = flow.buttonError;
  const settled = !flow.busy;

  return (
    <div style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || !!existingName}
        loading={flow.busy}
        aria-describedby={describedBy}
        onClick={(e) => flow.start(e.currentTarget)}
      >
        {t(existingName ? "finding.evalCase.buttonExists" : "finding.evalCase.button")}
      </Button>
      {!decided && !existingName && (
        <span id={hintId} style={s.hint}>
          {t("finding.evalCase.needsDecision")}
        </span>
      )}
      <div role="status" id={statusId}>
        {existingName && settled && (
          <span style={result?.created ? s.status : s.existing}>
            {t(result?.created ? "finding.evalCase.created" : "finding.evalCase.alreadyExists", {
              name: existingName,
            })}
          </span>
        )}
      </div>
      {failure && settled && (
        <span role="alert" style={s.error}>
          {failure}
        </span>
      )}
      {flow.dialog && (
        <RangeDialog
          suggestion={flow.dialog}
          pending={flow.dialogPending}
          error={flow.dialogError}
          onConfirm={flow.confirm}
          onCancel={flow.cancel}
        />
      )}
    </div>
  );
}
