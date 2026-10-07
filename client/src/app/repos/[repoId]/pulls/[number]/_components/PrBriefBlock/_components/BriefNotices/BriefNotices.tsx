"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import type { PrBrief, TourLanguage } from "@devdigest/shared";
import { Button } from "@devdigest/ui";
import { MISSING_INPUT_LABEL_KEY } from "../../constants";
import { shortSha } from "../../helpers";
import { s } from "./styles";

/** Why the last generation attempt did not produce a brief; the earlier brief stays shown. */
export type BriefFailure = { kind: "running" } | { kind: "failed"; message: string };

interface BriefNoticesProps {
  brief: PrBrief | null;
  stale: boolean;
  tourLanguage: TourLanguage;
  /** Provider whose API key is missing, or null when a key exists. */
  missingKeyProvider: string | null;
  failure: BriefFailure | null;
  retryDisabled: boolean;
  onRetry: () => void;
}

/** Text notices (never colour alone): missing key, outdated, language changed, failure, missing inputs. */
export function BriefNotices({
  brief,
  stale,
  tourLanguage,
  missingKeyProvider,
  failure,
  retryDisabled,
  onRetry,
}: BriefNoticesProps) {
  const t = useTranslations("brief");
  return (
    <div style={s.stack}>
      {missingKeyProvider && (
        <p style={s.notice}>
          {t("missingKey", { provider: missingKeyProvider })}{" "}
          <Link href="/settings/api-keys" style={s.link}>
            {t("missingKeyLink")}
          </Link>
        </p>
      )}
      {brief && stale && <p style={s.notice}>{t("outdated", { sha: shortSha(brief.head_sha) })}</p>}
      {brief && brief.language !== tourLanguage && <p style={s.notice}>{t("languageChanged")}</p>}
      {failure && (
        <p style={s.notice}>
          {failure.kind === "running" ? t("running") : failure.message}
          {failure.kind === "failed" && (
            <>
              {" "}
              <Button kind="ghost" size="sm" disabled={retryDisabled} onClick={onRetry}>
                {t("tryAgain")}
              </Button>
            </>
          )}
        </p>
      )}
      {brief && brief.missing_inputs.length > 0 && (
        <div>
          <p style={s.title}>{t("missingInputs.title")}</p>
          <ul style={s.list}>
            {brief.missing_inputs.map((m) => (
              <li key={m.input}>
                {t("missingInputs.reason", {
                  input: t(`missingInputs.${MISSING_INPUT_LABEL_KEY[m.input]}`),
                  reason: m.reason,
                })}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
