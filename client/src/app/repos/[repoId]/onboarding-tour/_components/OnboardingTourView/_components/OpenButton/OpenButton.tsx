"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { githubFileUrl } from "@/lib/github-urls";
import { s } from "./styles";

/** "Open" link to a file on the repo's default branch on GitHub (new tab; URL built from repo identity only). */
export function OpenButton({
  fullName,
  branch,
  path,
}: {
  fullName: string;
  branch: string;
  path: string;
}) {
  const t = useTranslations("onboardingSections");
  return (
    <a
      href={githubFileUrl(fullName, branch, path)}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={t("open.label", { path })}
      style={s.link}
    >
      <Icon.ExternalLink size={13} aria-hidden />
      <span>{t("open.text")}</span>
    </a>
  );
}
