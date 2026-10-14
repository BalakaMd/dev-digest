/* Install step: open a pull request or download a zip (AC-29…AC-37, AC-67, AC-71, AC-77).
   Draws its own footer. The request lives in the wizard (it locks Back and closing). */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon } from "@devdigest/ui";
import type { CiInstallResult } from "@devdigest/shared";
import { ApiError } from "../../../../../../../../../../lib/api";
import { githubSecretsUrl, isGithubUrl } from "../../../../../../../../../../lib/ci-links";
import { API_KEYS_HREF, HELP_DOCS_HREF } from "../constants";
import { downloadBase64Zip } from "../download";
import { s } from "../styles";
import type { StepProps } from "./types";

type Action = "open_pr" | "zip";
const BRANCH = "devdigest/ci";

/** GitHub's reason and the permissions the install needs, from the API error (AC-34). */
function installFailure(error: unknown): { reason: string; permissions: string | null } {
  if (!(error instanceof ApiError)) return { reason: "", permissions: null };
  const details = error.details as { needed_permissions?: unknown } | undefined;
  const needed = details && typeof details.needed_permissions === "string" ? details.needed_permissions : null;
  return { reason: error.message, permissions: needed };
}

export function InstallStep({ wizard, onClose }: StepProps) {
  const t = useTranslations("ci.exportWizard");
  const { state, install, check } = wizard;
  const { preview } = state;
  const tokenOk = preview?.github_token_configured ?? false;
  const [choice, setChoice] = React.useState<Action>("open_pr");
  const [zipError, setZipError] = React.useState(false);
  const action: Action = tokenOk ? choice : "zip";
  const result: CiInstallResult | undefined = install.data;
  const done = install.isSuccess && result !== undefined;
  const fileCount = preview?.files.length ?? 0;
  const blockedKey = !preview ? "generating" : check.block;

  const saveZip = (base64: string | null) => {
    setZipError(false);
    if (!base64 || !preview) return setZipError(true);
    try {
      downloadBase64Zip(base64, `devdigest-ci-${preview.agent_slug}.zip`);
    } catch {
      setZipError(true);
    }
  };

  const submit = async () => {
    if (!preview || wizard.installing) return;
    try {
      const res = await install.mutateAsync({
        repo: state.repo,
        triggers: state.triggers,
        post_as: state.postAs,
        workflow: state.workflow,
        action,
        acknowledge_risk: check.riskAcknowledged,
      });
      if (action === "zip") saveZip(res.zip_base64);
    } catch {
      /* shown below from install.error */
    }
  };

  const failure = install.isError ? installFailure(install.error) : null;
  const prUrl = result?.pr_url ?? null;

  return (
    <>
      {/* Always mounted so the announcement is read when it fills in (AC-33). */}
      <div aria-live="polite" role="status" style={done ? s.note : s.visuallyHidden}>
        {done && (action === "zip" ? t("successZip", { repo: state.repo }) : t("successPr", { repo: state.repo }))}
      </div>

      {done ? (
        <>
          {prUrl &&
            (isGithubUrl(prUrl) ? (
              <a href={prUrl} target="_blank" rel="noopener noreferrer" style={s.link}>
                {t("openPr")}
              </a>
            ) : (
              <span className="mono">{prUrl}</span>
            ))}
          {action === "zip" && (
            <div style={s.actions}>
              <Button icon="Copy" onClick={() => saveZip(result.zip_base64)}>
                {t("downloadAgain")}
              </Button>
              {zipError && (
                <span role="alert" style={s.error}>
                  {t("zipError")}
                </span>
              )}
            </div>
          )}
          <section aria-labelledby="ci-next-h" style={s.fieldset}>
            <h3 id="ci-next-h" style={s.sectionLabel}>
              {t("nextStepsHeading")}
            </h3>
            <ol style={s.steps}>
              <li>
                {t("nextSecret")}{" "}
                <a href={githubSecretsUrl(state.repo)} target="_blank" rel="noopener noreferrer" style={s.link}>
                  {t("nextSecretLink")}
                </a>
              </li>
              <li>{action === "zip" ? t("nextCommitZip") : t("nextMergePr")}</li>
              <li>{t("nextRequired")}</li>
            </ol>
          </section>
        </>
      ) : (
        <>
          {wizard.configNotApplied && (
            <p style={s.note}>
              <Icon.Info size={16} aria-hidden />
              <span>{t("configNotApplied")}</span>
            </p>
          )}
          <fieldset style={s.fieldset} disabled={wizard.installing}>
            <legend style={s.visuallyHidden}>{t("optionsLegend")}</legend>
            <label style={{ ...s.optionCard, ...(action === "open_pr" ? s.cardSelected : {}), ...(tokenOk ? {} : s.cardDisabled) }}>
              <input
                type="radio"
                name="ci-install-action"
                value="open_pr"
                data-autofocus={tokenOk ? "" : undefined}
                checked={action === "open_pr"}
                disabled={!tokenOk}
                aria-describedby={tokenOk ? undefined : "ci-token-missing"}
                onChange={() => setChoice("open_pr")}
              />
              <span style={s.optionBody}>
                <span style={s.optionTitle}>
                  <Icon.GitPullRequest size={16} aria-hidden />
                  <span style={{ flex: 1 }}>{t("installCardTitle")}</span>
                  <Badge color="var(--accent)">{t("recommended")}</Badge>
                </span>
                <span style={s.cardDesc}>{t("installCardBody", { repo: state.repo, count: fileCount })}</span>
                <span style={s.cardDesc}>{t("installPrMeta", { branch: BRANCH })}</span>
              </span>
            </label>
            {!tokenOk && (
              <p id="ci-token-missing" style={s.muted}>
                {t("tokenMissing")}{" "}
                <Link href={API_KEYS_HREF} style={s.link}>
                  {t("tokenMissingLink")}
                </Link>
              </p>
            )}
            <label style={{ ...s.optionCard, ...(action === "zip" ? s.cardSelected : {}) }}>
              <input
                type="radio"
                name="ci-install-action"
                value="zip"
                data-autofocus={tokenOk ? undefined : ""}
                checked={action === "zip"}
                onChange={() => setChoice("zip")}
              />
              <span style={s.optionBody}>
                <span style={s.optionTitle}>
                  <Icon.Copy size={16} aria-hidden />
                  <span style={{ flex: 1 }}>{t("zipCardTitle")}</span>
                  <span style={s.muted}>{t("zipCardHint")}</span>
                </span>
              </span>
            </label>
          </fieldset>

          {failure && (
            <div role="alert" style={s.error}>
              <div>{failure.reason ? t("installError", { reason: failure.reason }) : t("installErrorGeneric")}</div>
              {failure.permissions && (
                <div style={{ marginTop: 6 }}>
                  <strong>{t("neededPermissions")}:</strong> {failure.permissions}
                </div>
              )}
            </div>
          )}
          {wizard.installing && (
            <p role="status" style={s.muted}>
              {t("installProgress")}
            </p>
          )}
          <p style={s.center}>
            {t("helpPrefix")}{" "}
            <a href={HELP_DOCS_HREF} target="_blank" rel="noopener noreferrer" style={s.link}>
              {t("helpLink")}
            </a>
          </p>
        </>
      )}

      <div style={{ ...s.footer, margin: "0 -24px -20px" }}>
        {done ? (
          <>
            <span style={s.footerSpacer} />
            <Button kind="primary" data-autofocus onClick={onClose}>
              {t("done")}
            </Button>
          </>
        ) : (
          <>
            <Button icon="ChevronLeft" disabled={wizard.installing} onClick={wizard.goBack}>
              {t("back")}
            </Button>
            <span style={s.footerSpacer} />
            {blockedKey && (
              <span id="ci-install-reason" style={s.reason}>
                {t(`blocked.${blockedKey}`)}
              </span>
            )}
            <Button
              kind="primary"
              icon="Check"
              loading={wizard.installing}
              disabled={wizard.installing || blockedKey !== null}
              aria-describedby={blockedKey ? "ci-install-reason" : undefined}
              onClick={submit}
            >
              {wizard.installing ? t("installing") : failure ? t("retry") : t("install")}
            </Button>
          </>
        )}
      </div>
    </>
  );
}
