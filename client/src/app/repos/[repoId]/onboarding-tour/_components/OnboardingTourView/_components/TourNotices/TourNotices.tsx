"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Button, Icon } from "@devdigest/ui";
import type { OnboardingBlocked } from "@devdigest/shared";
import { s } from "./styles";

/** Blocked reason, missing-key notice, regeneration banner and failure banner. */
export function TourNotices({
  blocked,
  missingKeyProvider,
  regenerating,
  error,
  retryDisabled,
  onRetry,
}: {
  blocked: OnboardingBlocked | null;
  missingKeyProvider: string | null;
  /** A regeneration runs while an earlier tour is still shown (AC-32). */
  regenerating: boolean;
  error: string | null;
  retryDisabled: boolean;
  onRetry: () => void;
}) {
  const t = useTranslations("onboarding");
  return (
    <div style={s.list}>
      {blocked && (
        <div role="note" style={s.notice}>
          <Icon.AlertTriangle size={16} aria-hidden />
          <div style={s.text}>
            <div>{blocked.message}</div>
            <div style={s.meta}>
              {t("blocked.state", { status: blocked.index_status, count: blocked.files_indexed })}
            </div>
          </div>
        </div>
      )}
      {missingKeyProvider && (
        <div role="note" style={s.notice}>
          <Icon.AlertTriangle size={16} aria-hidden />
          <span style={s.text}>
            {t("missingKey.text", { provider: missingKeyProvider })}{" "}
            <Link href="/settings/api-keys" style={s.link}>
              {t("missingKey.link")}
            </Link>
          </span>
        </div>
      )}
      {regenerating && (
        <div role="status" style={s.notice}>
          <Icon.RefreshCw size={16} aria-hidden />
          <span style={s.text}>{t("regeneratingBanner")}</span>
        </div>
      )}
      {error !== null && (
        <div role="alert" style={s.error}>
          <Icon.AlertOctagon size={16} aria-hidden />
          <span style={s.text}>
            {t("failed.text", { reason: error || t("unknownError") })}
            {" "}
            <span style={s.meta}>{t("failed.keptOld")}</span>
          </span>
          <Button kind="secondary" size="sm" icon="RefreshCw" disabled={retryDisabled} onClick={onRetry}>
            {t("failed.retry")}
          </Button>
        </div>
      )}
    </div>
  );
}
