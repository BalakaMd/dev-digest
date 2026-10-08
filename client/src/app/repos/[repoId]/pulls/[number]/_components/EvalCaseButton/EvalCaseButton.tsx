/* EvalCaseButton — "Turn into eval case" on a finding card (SPEC-06 AC-1…9, 66).
   One click, no dialog. Enabled only once the finding is accepted or dismissed,
   and disabled again once a case exists (known up front via `existingCaseName`,
   or from the click's result — AC-9); the outcome (created / already exists /
   API error) is announced in a live region and, on success, as a toast. Case
   names are rendered as text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { useCaseFromFinding } from "../../../../../../../lib/hooks/eval";
import { notify } from "../../../../../../../lib/toast";
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
  const mutation = useCaseFromFinding(findingId);
  const result = mutation.data;
  const existingName = result?.case.name ?? existingCaseName ?? null;
  const statusId = `${hintId}-status`;
  const describedBy = existingName ? statusId : decided ? undefined : hintId;
  const failure = mutation.isError
    ? mutation.error.message || t("finding.evalCase.failed")
    : null;

  const onClick = () =>
    mutation.mutate(undefined, {
      onSuccess: (res) => {
        if (res.created) notify.success(t("finding.evalCase.created", { name: res.case.name }));
      },
    });

  return (
    <div style={s.wrap}>
      <Button
        kind="ghost"
        size="sm"
        icon="FlaskConical"
        disabled={!decided || !!existingName}
        loading={mutation.isPending}
        aria-describedby={describedBy}
        onClick={onClick}
      >
        {t(existingName ? "finding.evalCase.buttonExists" : "finding.evalCase.button")}
      </Button>
      {!decided && !existingName && (
        <span id={hintId} style={s.hint}>
          {t("finding.evalCase.needsDecision")}
        </span>
      )}
      <div role="status" id={statusId}>
        {result && !mutation.isPending ? (
          <span style={result.created ? s.status : s.existing}>
            {t(result.created ? "finding.evalCase.created" : "finding.evalCase.alreadyExists", {
              name: result.case.name,
            })}
          </span>
        ) : (
          existingCaseName &&
          !mutation.isPending && (
            <span style={s.existing}>
              {t("finding.evalCase.alreadyExists", { name: existingCaseName })}
            </span>
          )
        )}
      </div>
      {failure && !mutation.isPending && (
        <span role="alert" style={s.error}>
          {failure}
        </span>
      )}
    </div>
  );
}
