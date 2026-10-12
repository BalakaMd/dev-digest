/* Configure step: triggers, secrets expected, "Post results as", branch-protection note
   (AC-24…AC-28). The secrets status loads when this step opens. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon } from "@devdigest/ui";
import type { CiSecretsStatus } from "@devdigest/shared";
import { useCiSecrets } from "../../../../../../../../../../lib/hooks/ci";
import { POST_AS_VALUES, RECOMMENDED_POST_AS, TRIGGER_VALUES } from "../constants";
import { s } from "../styles";
import type { StepProps } from "./types";

type KeyStatus = CiSecretsStatus["openrouter_key"] | "checking";

export function ConfigureStep({ agent, wizard }: StepProps) {
  const t = useTranslations("ci.exportWizard");
  const { state } = wizard;
  const secrets = useCiSecrets(agent.id, state.repo);
  // A failed lookup is "unknown", never "not set": nothing is claimed that was not read.
  const keyStatus: KeyStatus = secrets.isLoading ? "checking" : (secrets.data?.openrouter_key ?? "unknown");

  return (
    <>
      <section aria-labelledby="ci-triggers-h" style={s.fieldset}>
        <h3 id="ci-triggers-h" style={s.sectionLabel}>
          {t("triggerLabel")}
        </h3>
        <div style={s.toggles}>
          {TRIGGER_VALUES.map((trigger, i) => {
            const pressed = state.triggers.includes(trigger);
            return (
              <button
                key={trigger}
                type="button"
                aria-pressed={pressed}
                data-autofocus={i === 0 ? "" : undefined}
                style={{ ...s.toggle, ...(pressed ? s.togglePressed : {}) }}
                onClick={() => wizard.toggleTrigger(trigger)}
              >
                {pressed && <Icon.Check size={13} aria-hidden />}
                <span className="mono">{`pull_request:${trigger}`}</span>
              </button>
            );
          })}
        </div>
      </section>

      <section aria-labelledby="ci-secrets-h" style={s.fieldset}>
        <h3 id="ci-secrets-h" style={s.sectionLabel}>
          {t("secretsHeading")}
        </h3>
        <ul style={s.secrets}>
          <li style={s.secretRow}>
            <code className="mono" style={s.secretKey}>
              OPENROUTER_API_KEY
            </code>
            <span style={s.secretDesc}>{t("secrets.openrouterDesc")}</span>
            <Badge color={keyStatus === "set" ? "var(--ok)" : keyStatus === "not_set" ? "var(--warn, #9a6700)" : undefined}>
              {t(`secrets.status.${keyStatus}`)}
            </Badge>
          </li>
          <li style={{ ...s.secretRow, borderBottom: "none" }}>
            <code className="mono" style={s.secretKey}>
              GITHUB_TOKEN
            </code>
            <span style={s.secretDesc}>{t("secrets.githubDesc")}</span>
            <Badge color="var(--ok)">{t("secrets.status.ready")}</Badge>
          </li>
        </ul>
        <p style={s.muted}>{t("secretsHint")}</p>
      </section>

      <fieldset style={s.fieldset}>
        <legend style={s.sectionLabel}>{t("postResultsLabel")}</legend>
        {POST_AS_VALUES.map((value) => (
          <label key={value} style={s.radio}>
            <input
              type="radio"
              name="ci-post-as"
              value={value}
              checked={state.postAs === value}
              onChange={() => wizard.setPostAs(value)}
            />
            <span>{t(`postAs.${value}`)}</span>
            {value === RECOMMENDED_POST_AS && <Badge color="var(--accent)">{t("recommended")}</Badge>}
          </label>
        ))}
      </fieldset>

      <p style={s.note}>
        <Icon.Info size={16} aria-hidden />
        <span>{t("failOnNote")}</span>
      </p>
    </>
  );
}
