/* CaseEditorForm — the editing state of the case editor (AC-46…54, 75).
   Input is locked once a case exists (AC-50, AC-72): only the name and the
   expectations can change. Stored text is rendered as text only (NFR-3).
   Any failed save or run shows the API message in a role="alert" and keeps the
   editor open (EC-14); the client adds no size check and does not branch on
   error codes. After a failed save, Save stays disabled until the name or the
   expectations change (AC-75). */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal, Tabs, Toggle } from "@devdigest/ui";
import type { Agent, EvalCaseDetail, EvalExpectedOutput } from "@devdigest/shared";
import {
  useCreateEvalCase,
  useEvalCase,
  useRunEvalCase,
  useUpdateEvalCase,
} from "../../../../../../../../../lib/hooks/eval";
import { formatCostOrDash } from "../../../../../../../../../lib/format";
import { notify } from "../../../../../../../../../lib/toast";
import {
  appendSkeleton,
  diffFilePaths,
  formatExpectedOutput,
  validateExpectedOutput,
} from "./expected-output";
import { s } from "./styles";

type InputTab = "diff" | "files" | "meta";

export function CaseEditorForm({
  agent,
  stored,
  onClose,
}: {
  agent: Agent;
  /** The stored case (edit) or null (create). */
  stored: EvalCaseDetail | null;
  onClose: () => void;
}) {
  const t = useTranslations("eval.caseEditor");
  const create = useCreateEvalCase(agent.id);
  const update = useUpdateEvalCase(agent.id);
  const runCase = useRunEvalCase(agent.id);

  // Becomes set after the first successful create; from then on the input is locked.
  const [caseId, setCaseId] = React.useState<string | null>(stored?.id ?? null);
  const locked = caseId !== null;
  const live = useEvalCase(caseId);
  const detail = live.data ?? stored;

  const [name, setName] = React.useState(stored?.name ?? "");
  const [expected, setExpected] = React.useState(stored ? formatExpectedOutput(stored.expected_output) : "[]");
  const [diff, setDiff] = React.useState("");
  const [prTitle, setPrTitle] = React.useState("");
  const [prBody, setPrBody] = React.useState("");
  const [tab, setTab] = React.useState<InputTab>("diff");
  const [runOnSave, setRunOnSave] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<"save" | "run" | null>(null);
  const [savedKey, setSavedKey] = React.useState<string | null>(
    stored ? `${stored.name}\u0000${formatExpectedOutput(stored.expected_output)}` : null,
  );
  const [rejectedKey, setRejectedKey] = React.useState<string | null>(null);

  const key = `${name}\u0000${expected}`;
  const check = React.useMemo(() => validateExpectedOutput(expected), [expected]);
  const nameMissing = name.trim().length === 0;
  const inputMissing = !locked && diff.trim().length === 0;
  const blocked = busy !== null || !check.ok || nameMissing || inputMissing || rejectedKey === key;

  const shownDiff = locked ? (detail?.input_diff ?? "") : diff;
  const files = React.useMemo(() => diffFilePaths(shownDiff), [shownDiff]);
  const nameId = React.useId();
  const expectedId = React.useId();
  const reasonId = React.useId();
  const prTitleId = React.useId();
  const prBodyId = React.useId();

  const reason = !check.ok
    ? t(`reasons.${check.reason}`) + (check.index ? ` (#${check.index})` : "")
    : null;

  /** Save the case if it is new or changed; returns its id. Throws on failure. */
  async function persist(): Promise<string> {
    if (!check.ok) throw new Error(t("reasons.notJson"));
    if (caseId === null) {
      const created = await create.mutateAsync({
        name: name.trim(),
        input_diff: diff,
        input_meta: { title: prTitle, body: prBody },
        expected_output: check.value as EvalExpectedOutput,
      });
      setCaseId(created.id);
      setSavedKey(key);
      return created.id;
    }
    if (key !== savedKey) {
      await update.mutateAsync({ id: caseId, patch: { name: name.trim(), expected_output: check.value as EvalExpectedOutput } });
      setSavedKey(key);
    }
    return caseId;
  }

  async function act(mode: "save" | "run") {
    setError(null);
    setBusy("save");
    let id: string;
    try {
      id = await persist();
    } catch (e) {
      setRejectedKey(key);
      setError(e instanceof Error && e.message ? e.message : t("saveFailed"));
      setBusy(null);
      return;
    }
    if (mode === "run" || runOnSave) {
      setBusy("run");
      try {
        await runCase.mutateAsync(id);
      } catch (e) {
        setError(e instanceof Error && e.message ? e.message : t("runFailed"));
        setBusy(null);
        return;
      }
    }
    setBusy(null);
    if (mode === "save") {
      notify.success(stored || caseId ? t("saved") : t("created"));
      onClose();
    }
  }

  const last = detail?.last_result ?? null;
  const lastParts = last
    ? [
        t("expectedGot", { expected: last.expected_count, returned: last.returned_count }),
        last.duration_ms != null ? t("seconds", { seconds: (last.duration_ms / 1000).toFixed(1) }) : null,
        last.cost_usd != null ? formatCostOrDash(last.cost_usd) : null,
      ].filter(Boolean)
    : [];

  return createPortal(
    <Modal
      width={1000}
      title={t("caseTitle", { name: name.trim() || t("newTitle") })}
      subtitle={t("subtitle", { agent: agent.name })}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <label style={s.runOnSave}>
            <Toggle on={runOnSave} onChange={setRunOnSave} />
            {t("runOnSave")}
          </label>
          <span style={s.spacer} />
          <Button kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button
            kind="secondary"
            icon="Play"
            disabled={blocked}
            loading={busy === "run"}
            onClick={() => void act("run")}
          >
            {busy === "run" ? t("running") : t("runCase")}
          </Button>
          <Button
            kind="primary"
            icon="Check"
            disabled={blocked}
            loading={busy === "save"}
            onClick={() => void act("save")}
          >
            {busy === "save" ? t("saving") : t("save")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.left}>
          <label htmlFor={nameId} style={s.label}>
            {t("nameLabel")}
            <span aria-hidden="true" style={s.required}>
              *
            </span>
          </label>
          <input
            id={nameId}
            required
            maxLength={120}
            value={name}
            placeholder={t("namePlaceholder")}
            aria-invalid={nameMissing}
            aria-describedby={nameMissing ? `${nameId}-err` : undefined}
            onChange={(e) => setName(e.target.value)}
            style={nameMissing ? s.fieldInvalid : s.field}
          />
          {nameMissing && (
            <span id={`${nameId}-err`} style={s.fieldError}>
              {t("nameRequired")}
            </span>
          )}

          <div style={s.label}>{t("inputLabel")}</div>
          {locked && <div style={s.fieldHint}>{t("inputReadOnly")}</div>}
          <Tabs
            pad="0"
            value={tab}
            onChange={(k) => setTab(k as InputTab)}
            tabs={[
              { key: "diff", label: t("tabs.diff") },
              { key: "files", label: t("tabs.files") },
              { key: "meta", label: t("tabs.prMeta") },
            ]}
          />
          {tab === "diff" &&
            (locked ? (
              <div style={s.readOnlyBox}>
                <pre aria-label={t("tabs.diff")} style={s.pre}>
                  {shownDiff}
                </pre>
              </div>
            ) : (
              <>
                <textarea
                  aria-label={t("tabs.diff")}
                  value={diff}
                  placeholder={t("diffPlaceholder")}
                  onChange={(e) => setDiff(e.target.value)}
                  style={s.textarea(false)}
                />
              </>
            ))}
          {tab === "files" && (
            <div style={s.readOnlyBox}>
              {files.length === 0 ? (
                <div style={s.state}>{t("filesEmpty")}</div>
              ) : (
                <ul aria-label={t("filesHeading")} style={s.fileList}>
                  {files.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              )}
            </div>
          )}
          {tab === "meta" &&
            (locked ? (
              <div style={s.readOnlyBox}>
                <pre style={s.pre}>{detail?.input_meta.title}</pre>
                <pre style={s.pre}>{detail?.input_meta.body}</pre>
              </div>
            ) : (
              <>
                <label htmlFor={prTitleId} style={s.label}>
                  {t("titleLabel")}
                </label>
                <input
                  id={prTitleId}
                  value={prTitle}
                  placeholder={t("titlePlaceholder")}
                  onChange={(e) => setPrTitle(e.target.value)}
                  style={s.field}
                />
                <label htmlFor={prBodyId} style={s.label}>
                  {t("bodyLabel")}
                </label>
                <textarea
                  id={prBodyId}
                  value={prBody}
                  placeholder={t("bodyPlaceholder")}
                  onChange={(e) => setPrBody(e.target.value)}
                  style={{ ...s.textarea(false), minHeight: 120 }}
                />
              </>
            ))}
        </div>

        <div style={s.right}>
          <div style={s.expectedHeader}>
            <label htmlFor={expectedId} style={s.label}>
              {t("expectedOutput")}
            </label>
            <span role="status" style={s.badge(check.ok)}>
              {check.ok ? t("validJson") : t("invalidJson")}
            </span>
            <span style={s.spacer} />
            <Button kind="secondary" size="sm" icon="Plus" onClick={() => setExpected(appendSkeleton(expected))}>
              {t("findingSkeleton")}
            </Button>
          </div>
          <textarea
            id={expectedId}
            spellCheck={false}
            value={expected}
            aria-invalid={!check.ok}
            aria-describedby={reason ? reasonId : undefined}
            onChange={(e) => setExpected(e.target.value)}
            style={s.textarea(!check.ok)}
          />
          {reason ? (
            <span id={reasonId} style={s.fieldError}>
              {t("validationReason", { reason })}
            </span>
          ) : (
            <span style={s.fieldHint}>{t("expectedHint")}</span>
          )}
          {last && (
            <div style={s.lastRun(last.passed)} data-testid="last-run">
              <span style={s.lastRunTitle}>{last.passed ? t("lastRunPassed") : t("lastRunFailed")}</span>
              {" · "}
              {lastParts.join(" · ")}
            </div>
          )}
          {error && (
            <div role="alert" style={s.alert}>
              {error}
            </div>
          )}
        </div>
      </div>
    </Modal>,
    document.body,
  );
}
