/* RangeDialog — choose the line range of an eval case (SPEC-07 AC-20…23, 32, 33, 34, 40, 41, 46).
   Own accessible dialog (plan Q-1): the vendored Modal has no name, focus handling or Escape.
   Pure presentation: the opener owns the requests. Validity, preview and the selected option
   are derived in render from the two field texts. Patch text, terms and names are text nodes only. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, IconBtn } from "@devdigest/ui";
import type { EvalCaseSuggestionDetail, EvalLineRange } from "@devdigest/shared";
import { fieldsToRange, previewLines, selectedOption, validateFields } from "../../range-model";
import { useDialogFocus } from "./use-dialog-focus";
import { s } from "./styles";

export function RangeDialog({
  suggestion,
  pending,
  error,
  onConfirm,
  onCancel,
}: {
  suggestion: EvalCaseSuggestionDetail;
  /** A confirm (or a reload after a changed diff) is in flight. */
  pending: boolean;
  /** Message of the last failed attempt, shown in the dialog. */
  error: string | null;
  onConfirm: (range: EvalLineRange) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("prReview.finding.evalCase.range");
  const titleId = React.useId();
  const previewId = React.useId();
  const { suggested, cited, reason } = suggestion;
  // Initialised once: a reloaded suggestion replaces the props but keeps what the user typed (AC-43).
  const [startText, setStartText] = React.useState(String(suggested.start_line));
  const [endText, setEndText] = React.useState(String(suggested.end_line));
  const { ref, onKeyDown } = useDialogFocus(onCancel);

  const problem = validateFields(startText, endText, suggestion.hunks);
  const range = problem ? null : fieldsToRange(startText, endText);
  const selected = selectedOption(startText, endText, suggested, cited);
  const lines = range ? previewLines(suggestion.patch_lines, range) : [];
  const canConfirm = range !== null && !pending;

  const pick = (r: EvalLineRange) => {
    setStartText(String(r.start_line));
    setEndText(String(r.end_line));
  };
  const confirm = () => {
    if (range && !pending) onConfirm(range);
  };
  const onFieldKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    confirm();
  };

  const options = [
    { key: "suggested", label: t("suggested"), r: suggested },
    { key: "cited", label: t("cited"), r: cited },
  ] as const;

  const reasons: string[] = [
    ...reason.terms.map((x) => t("termMatched", { term: x.term, count: x.count })),
    ...(reason.expanded_to_function
      ? [
          reason.expanded_to_function.name === null
            ? t("expandedAnonymous")
            : t("expandedFunction", { name: reason.expanded_to_function.name }),
        ]
      : []),
    ...(reason.function_too_long ? [t("functionTooLong")] : []),
    ...(reason.structure_available ? [] : [t("noStructure")]),
  ];

  return createPortal(
    <div style={s.overlay} onClick={(e) => e.stopPropagation()} onKeyDown={onKeyDown}>
      <div ref={ref} role="dialog" aria-modal="true" aria-labelledby={titleId} style={s.dialog}>
        <div style={s.header}>
          <h2 id={titleId} style={s.title}>
            {t("title")}
          </h2>
          <IconBtn icon="X" label={t("close")} onClick={onCancel} />
        </div>
        <div style={s.body}>
          <fieldset style={s.group}>
            <legend style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>
              {t("optionsLabel")}
            </legend>
            {options.map((o, i) => (
              <label key={o.key} style={s.option}>
                <input
                  type="radio"
                  name={`${titleId}-range`}
                  checked={selected === o.key}
                  onChange={() => pick(o.r)}
                  data-autofocus={i === 0 ? "" : undefined}
                />
                {t("rangeOption", { label: o.label, start: o.r.start_line, end: o.r.end_line })}
                {selected === o.key && <span style={s.marker}>{t("selectedMarker")}</span>}
              </label>
            ))}
          </fieldset>

          <div style={s.fields}>
            <label style={s.field}>
              {t("startLabel")}
              <input
                type="text"
                inputMode="numeric"
                value={startText}
                onChange={(e) => setStartText(e.target.value)}
                onKeyDown={onFieldKeyDown}
                aria-invalid={problem !== null}
                style={s.input}
              />
            </label>
            <label style={s.field}>
              {t("endLabel")}
              <input
                type="text"
                inputMode="numeric"
                value={endText}
                onChange={(e) => setEndText(e.target.value)}
                onKeyDown={onFieldKeyDown}
                aria-invalid={problem !== null}
                style={s.input}
              />
            </label>
          </div>

          {problem && (
            <div role="alert" style={s.problem}>
              {t(problem === "empty" ? "invalidEmpty" : problem === "notNumber" ? "invalidNumber" : "noHunk")}
            </div>
          )}

          {range && (
            <div>
              <h3 id={previewId} style={s.sectionHeading}>
                {t("previewHeading", { start: range.start_line, end: range.end_line })}
              </h3>
              {lines.length === 0 ? (
                <div style={s.muted}>{t("previewEmpty")}</div>
              ) : (
                <ol tabIndex={0} aria-labelledby={previewId} style={s.preview}>
                  {lines.map((l) => (
                    <li key={l.line} style={s.previewRow}>
                      <span style={s.lineNo}>{l.line}</span>
                      <span style={s.lineText}>{l.text}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>
          )}

          {reasons.length > 0 && (
            <div>
              <h3 style={s.sectionHeading}>{t("reasonHeading")}</h3>
              <ul style={s.reason}>
                {reasons.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </div>
          )}

          {error && (
            <div role="alert" style={s.problem}>
              {error}
            </div>
          )}
        </div>
        <div style={s.footer}>
          <Button kind="secondary" size="sm" onClick={onCancel}>
            {t("cancel")}
          </Button>
          <Button kind="primary" size="sm" disabled={!canConfirm} loading={pending} onClick={confirm}>
            {t("confirm")}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
