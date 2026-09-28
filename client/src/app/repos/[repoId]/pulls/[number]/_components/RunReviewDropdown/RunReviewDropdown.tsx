/* RunReviewDropdown — ported from components2.jsx.
   "Run all enabled agents" / a specific agent → kicks off POST /pulls/:id/review
   and hands the resulting runIds up so the parent can stream SSE live status. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, type DropdownItemDef } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { DROPDOWN_WIDTH } from "./constants";

export function RunReviewDropdown({
  prId,
  size = "sm",
  kind = "primary",
  warnMerged = false,
  onRunStart,
  onRunsStarted,
  onRunSettled,
}: {
  prId: string;
  size?: "sm" | "md" | "lg";
  kind?: "primary" | "secondary";
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired the moment a run is kicked off (before it completes). */
  onRunStart?: () => void;
  onRunsStarted?: (runIds: string[]) => void;
  /** Fired when the run request settles (success or error). */
  onRunSettled?: () => void;
}) {
  const t = useTranslations("prReview");
  const router = useRouter();
  const { data: agents } = useAgents();
  const run = useRunReview();
  const all = agents ?? [];
  const hasEnabled = all.some((a) => a.enabled);

  const kick = async (opts: { all?: boolean; agentId?: string }) => {
    onRunStart?.();
    try {
      const res = await run.mutateAsync({ prId, ...opts });
      onRunsStarted?.(res.runs.map((r) => r.run_id));
    } finally {
      onRunSettled?.();
    }
  };

  // Only enabled agents can be picked individually; a disabled one is not a
  // valid target for a review run.
  const enabledAgents = all.filter((a) => a.enabled);
  const allDisabled = all.length > 0 && enabledAgents.length === 0;
  const agentItems: DropdownItemDef[] = enabledAgents.length
    ? enabledAgents.map((a) => ({
        label: a.name,
        icon: "Cpu" as const,
        hint: a.model,
        onClick: () => kick({ agentId: a.id }),
      }))
    : all.length
      ? [
          {
            label: t("runReview.noEnabledAgents"),
            icon: "Settings",
            muted: true,
            onClick: () => router.push("/agents"),
          },
        ]
      : [{ label: "No agents yet — create one", icon: "Plus", muted: true, onClick: () => router.push("/agents") }];

  const items: DropdownItemDef[] = [
    // Merged/closed PRs can still be reviewed (informational only); lead with a
    // muted, non-actionable warning so the intent is clear.
    ...(warnMerged
      ? [
          { label: t("runReview.mergedWarning"), icon: "AlertTriangle" as const, muted: true },
          { divider: true } as DropdownItemDef,
        ]
      : []),
    {
      label: t("runReview.runAll"),
      icon: "Play",
      // No enabled agent to run — render inactive rather than kicking off a
      // review with nothing to review.
      ...(hasEnabled ? { onClick: () => kick({ all: true }) } : { muted: true }),
    },
    { divider: true },
    ...agentItems,
    // The "no enabled agents" placeholder above already links to /agents, so
    // showing "Configure agents…" right after it would be a duplicate.
    ...(allDisabled
      ? []
      : [
          { divider: true } as DropdownItemDef,
          {
            label: t("runReview.configureAgents"),
            icon: "Settings",
            muted: true,
            onClick: () => router.push("/agents"),
          } as DropdownItemDef,
        ]),
  ];

  return (
    <Dropdown
      width={DROPDOWN_WIDTH}
      align="right"
      items={items}
      trigger={
        <span
          title={warnMerged ? t("runReview.mergedTooltip") : undefined}
          style={warnMerged ? { opacity: 0.6 } : undefined}
        >
          <Button kind={kind} size={size} iconRight="ChevronDown" icon="Sparkles" loading={run.isPending}>
            {run.isPending ? t("runReview.running") : t("runReview.runReview")}
          </Button>
        </span>
      }
    />
  );
}
