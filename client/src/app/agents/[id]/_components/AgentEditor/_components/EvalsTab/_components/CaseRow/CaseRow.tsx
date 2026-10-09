/* CaseRow — one eval case in the Evals tab: name, expectation type(s),
   `file:start–end`, the result of its latest scored execution (icon + text, not
   colour alone) and icon-only Run / Edit / Delete controls with accessible names
   (SPEC-06 AC-10, NFR-3/4/5). All stored text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { EvalCaseSummary, EvalExpectationType } from "@devdigest/shared";
import { s } from "./styles";

const TYPE_KEY: Record<EvalExpectationType, string> = {
  must_find: "evalsTab.typeMustFind",
  must_not_flag: "evalsTab.typeMustNotFlag",
};

export function CaseRow({
  evalCase,
  running,
  runDisabled,
  onRun,
  onEdit,
  onDelete,
}: {
  evalCase: EvalCaseSummary;
  /** This case is being run on its own right now. */
  running: boolean;
  /** Another execution is in flight — Run is unavailable. */
  runDisabled: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations("eval");
  const { name, expected_output: expected, last_result: last } = evalCase;
  const first = expected[0];
  const types = Array.from(new Set(expected.map((e) => e.type)));
  const state = last ? (last.passed ? "passed" : "failed") : "never";
  const StatusIcon = state === "passed" ? Icon.CheckCircle : state === "failed" ? Icon.XCircle : Icon.Dot;

  return (
    <li style={s.row} data-testid={`case-row-${evalCase.id}`}>
      <span style={s.status(state)}>
        <StatusIcon size={16} aria-hidden />
        {t(state === "never" ? "evalsTab.neverRun" : state === "passed" ? "evalsTab.passed" : "evalsTab.failed")}
      </span>
      <div style={s.main}>
        <div style={s.name} className="mono">
          {name}
        </div>
        <div style={s.where}>
          {types.map((type) => (
            <Badge key={type} mono>
              {t(TYPE_KEY[type])}
            </Badge>
          ))}
          {first && (
            <span className="mono" style={s.file}>
              {t("evalsTab.lines", { file: first.file, start: first.start_line, end: first.end_line })}
            </span>
          )}
          {expected.length > 1 && <span>{t("evalsTab.moreExpectations", { count: expected.length - 1 })}</span>}
        </div>
      </div>
      <div style={s.actions}>
        <Button
          kind="tertiary"
          size="sm"
          icon="Play"
          loading={running}
          disabled={runDisabled}
          aria-label={t("evalsTab.runCase", { name })}
          title={t("evalsTab.runCase", { name })}
          onClick={onRun}
        />
        <Button
          kind="tertiary"
          size="sm"
          icon="Edit"
          aria-label={t("evalsTab.editCase", { name })}
          title={t("evalsTab.editCase", { name })}
          onClick={onEdit}
        />
        <Button
          kind="tertiary"
          size="sm"
          icon="Trash"
          aria-label={t("evalsTab.deleteCase", { name })}
          title={t("evalsTab.deleteCase", { name })}
          onClick={onDelete}
        />
      </div>
    </li>
  );
}
