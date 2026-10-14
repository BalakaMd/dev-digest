/* Preview step: the files Install would create, the editable workflow file and the
   checks on it (AC-9, AC-10, AC-70, AC-23, AC-74, AC-68). Generates the files on first
   entry, and again when earlier choices changed and nothing was edited. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiPreviewFile } from "@devdigest/shared";
import { formatBytes } from "../helpers";
import { s } from "../styles";
import type { StepProps } from "./types";

export function PreviewStep({ wizard }: StepProps) {
  const t = useTranslations("ci.exportWizard");
  const { state, check } = wizard;
  const { preview } = state;
  const [selected, setSelected] = React.useState<string | null>(null);
  const started = React.useRef(false);
  const { regenerate } = wizard;
  const needsGeneration = preview === null || (wizard.stale && !wizard.edited);

  React.useEffect(() => {
    if (!needsGeneration || started.current) return;
    started.current = true;
    regenerate().catch(() => undefined); // the shell shows the error
  }, [needsGeneration, regenerate]);

  if (!preview) {
    return (
      <div>
        {wizard.regenerateError ? (
          <Button
            icon="RefreshCw"
            onClick={() => {
              wizard.resetRegenerateError();
              regenerate().catch(() => undefined);
            }}
          >
            {t("retry")}
          </Button>
        ) : (
          <p role="status" style={s.muted}>
            {t("generating")}
          </p>
        )}
      </div>
    );
  }

  const files = preview.files;
  const file: CiPreviewFile | undefined = files.find((f) => f.path === selected) ?? files.find((f) => f.editable) ?? files[0];
  const result = check.result;

  return (
    <>
      <div style={s.previewGrid}>
        <div style={{ ...s.fileList, listStyle: "none" }}>
          <h3 style={s.fileListHead}>{t("filesToCreate")}</h3>
          <ul aria-label={t("fileListLabel")} style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {files.map((f) => {
              const active = f.path === file?.path;
              return (
                <li key={f.path}>
                  <button
                    type="button"
                    aria-current={active ? "true" : undefined}
                    data-autofocus={f.editable ? "" : undefined}
                    style={{ ...s.fileBtn, ...(active ? s.fileBtnActive : {}) }}
                    onClick={() => setSelected(f.path)}
                  >
                    <Icon.FileText size={14} aria-hidden />
                    <span className="mono">{f.path}</span>
                    {f.kind === "bundle" && <span style={s.fileSize}>{formatBytes(f.size_bytes)}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {file && (
          <div style={s.editorPane}>
            <div style={s.editorHead}>
              <span className="mono">{file.path}</span>
              <span style={s.footerSpacer} />
              <Badge>{file.editable ? t("editable") : t("readOnly")}</Badge>
            </div>
            {file.kind === "bundle" ? (
              <p style={{ ...s.editorBody, ...s.muted, whiteSpace: "normal" }}>
                {t("bundleSummary", { size: formatBytes(file.size_bytes) })}
              </p>
            ) : file.editable ? (
              <textarea
                className="mono"
                aria-label={t("editorLabel", { path: file.path })}
                spellCheck={false}
                value={state.workflow}
                onChange={(e) => wizard.setWorkflow(e.target.value)}
                style={{ ...s.editorBody, ...s.editorTextarea }}
              />
            ) : (
              <pre
                className="mono"
                tabIndex={0}
                aria-label={t("readOnlyLabel", { path: file.path })}
                style={s.editorBody}
              >
                {file.contents ?? ""}
              </pre>
            )}
          </div>
        )}
      </div>

      <p style={s.note}>
        <Icon.Info size={16} aria-hidden />
        <span>{t("notCarried", { count: preview.context_docs_count })}</span>
      </p>

      <div style={s.checks} aria-live="polite">
        {check.checking && (
          <p role="status" style={s.muted}>
            {t("checkingNow")}
          </p>
        )}
        {check.block === "checkFailed" && (
          <div role="alert" style={s.error}>
            {t("blocked.checkFailed")}{" "}
            <Button size="sm" onClick={check.recheck}>
              {t("recheck")}
            </Button>
          </div>
        )}
        {result?.yaml_error && (
          <div role="alert" style={s.error}>
            {t("yamlErrorLine", { line: result.yaml_error.line, message: result.yaml_error.message })}
          </div>
        )}
        {result && result.leaks.length > 0 && (
          <div role="alert" style={s.error}>
            <strong>{t("leaksHeading")}</strong>
            <ul style={s.checkList}>
              {result.leaks.map((l) => (
                <li key={`${l.path}:${l.line}`} className="mono">
                  {t("leakItem", { path: l.path, line: l.line, masked: l.masked })}
                </li>
              ))}
            </ul>
          </div>
        )}
        {check.risks.length > 0 && (
          <div style={s.warn}>
            <strong>{t("risksHeading")}</strong>
            <ul style={s.checkList}>
              {check.risks.map((r) => (
                <li key={`${r.kind}:${r.detail}`}>
                  <strong>{t(`risk.${r.kind}`)}:</strong> {r.detail}
                </li>
              ))}
            </ul>
            <label style={{ ...s.radio, marginTop: 10 }}>
              <input
                type="checkbox"
                checked={check.riskAcknowledged}
                onChange={(e) => check.setRiskAcknowledged(e.target.checked)}
              />
              <span>{t("ackRisk")}</span>
            </label>
          </div>
        )}
      </div>
    </>
  );
}
