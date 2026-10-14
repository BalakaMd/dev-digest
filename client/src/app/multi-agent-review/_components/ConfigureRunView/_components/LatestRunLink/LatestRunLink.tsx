"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import { useLatestMultiAgentRun } from "@/lib/hooks/multi-agent-review";
import { s } from "./styles";

/* Card link to the newest multi-agent run of the picked PR; renders nothing
   while loading or when the PR has no run yet. */
export function LatestRunLink({ prId }: { prId: string }) {
  const t = useTranslations("multiAgentConfigure");
  const { data } = useLatestMultiAgentRun(prId);
  const latest = data?.latest;
  if (!latest) return null;

  const ranAt = new Date(latest.ran_at);
  const when = Number.isNaN(ranAt.getTime())
    ? null
    : ranAt.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });

  return (
    <Link href={`/multi-agent-review/${latest.id}`} style={s.link}>
      <span style={s.icon} aria-hidden="true">
        <Icon.History size={16} />
      </span>
      <span style={s.body}>
        <div style={s.title}>{t("latestRun")}</div>
        {when && <div style={s.when}>{t("latestRunWhen", { when })}</div>}
      </span>
      <Icon.ArrowRight size={16} style={s.arrow} />
    </Link>
  );
}
