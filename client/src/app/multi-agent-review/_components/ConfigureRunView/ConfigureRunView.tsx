/* ConfigureRunView — /multi-agent-review. Step 1 picks an open PR, step 2 ticks
   the agents (none pre-checked), then one multi-agent run starts and the result
   page opens. All text from the API is rendered as text nodes. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Icon, SelectInput } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useAgents } from "@/lib/hooks/agents";
import { usePulls } from "@/lib/hooks/core";
import { useRunReview } from "@/lib/hooks/reviews";
import { useReviewEstimates } from "@/lib/hooks/multi-agent-review";
import { useActiveRepo } from "@/lib/repo-context";
import { formatCostUsd } from "@/lib/format";
import { formatDurationMs } from "../format";
import { AgentCard } from "./_components/AgentCard";
import { LatestRunLink } from "./_components/LatestRunLink";
import { openPulls, summariseSelection } from "./helpers";
import { s } from "./styles";

export function ConfigureRunView() {
  const t = useTranslations("multiAgentConfigure");
  const router = useRouter();
  const search = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const pulls = usePulls(activeRepo?.id);
  const { data: agents, isError: agentsError } = useAgents();
  const { data: estimates } = useReviewEstimates();
  const run = useRunReview();
  const inFlight = React.useRef(false);

  const open = openPulls(pulls.data);
  const wanted = search.get("pr");
  const [picked, setPicked] = React.useState<string | null>(null);
  const prId = picked ?? (wanted && open.some((p) => p.id === wanted) ? wanted : null);
  const [checked, setChecked] = React.useState<ReadonlySet<string>>(new Set());

  const enabled = (agents ?? []).filter((a) => a.enabled);
  const checkedIds = enabled.filter((a) => checked.has(a.id)).map((a) => a.id);
  const count = checkedIds.length;
  const estById = new Map((estimates?.estimates ?? []).map((e) => [e.agent_id, e]));
  const sum = summariseSelection(checkedIds, estimates?.estimates ?? []);

  const toggle = (id: string, v: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const start = async () => {
    if (inFlight.current || !prId || count === 0) return;
    inFlight.current = true;
    try {
      const res = await run.mutateAsync({ prId, agentIds: checkedIds });
      if (res.multi_agent_run_id) router.push(`/multi-agent-review/${res.multi_agent_run_id}`);
    } catch {
      // Global error toast reports it; keep the screen for a retry.
    } finally {
      inFlight.current = false;
    }
  };

  let step1: React.ReactNode;
  if (!activeRepo) step1 = <p style={s.message}>{t("noRepo")}</p>;
  else if (pulls.isError) step1 = <p style={s.message}>{t("prsError")}</p>;
  else if (pulls.isLoading) step1 = null;
  else if (open.length === 0) step1 = <p style={s.message}>{t("noOpenPr")}</p>;
  else {
    step1 = (
      <div>
        <label>
          <span style={s.srOnly}>{t("prSelectLabel")}</span>
          <SelectInput
            mono={false}
            value={prId ?? ""}
            onChange={(v) => {
              setPicked(v || null);
              setChecked(new Set());
            }}
            options={[
              { value: "", label: t("prPlaceholder") },
              ...open.map((p) => ({ value: p.id, label: t("prOption", { number: p.number, title: p.title }) })),
            ]}
          />
        </label>
        {prId && <LatestRunLink prId={prId} />}
      </div>
    );
  }

  const time = sum.timeMs == null ? "—" : formatDurationMs(sum.timeMs);
  const cost = sum.costUsd == null ? "—" : formatCostUsd(sum.costUsd);

  let step2: React.ReactNode;
  if (!prId) {
    step2 = (
      <div style={s.empty}>
        <span style={s.emptyIcon} aria-hidden="true">
          <Icon.GitPullRequest size={20} />
        </span>
        <div style={s.emptyTitle}>{t("pickPrFirst")}</div>
        <div style={s.emptyHint}>{t("pickPrFirstHint")}</div>
      </div>
    );
  }
  else if (agentsError) step2 = <p style={s.message}>{t("agentsError")}</p>;
  else if (enabled.length === 0) {
    step2 = (
      <p style={s.message}>
        {t("noAgents")}{" "}
        <button type="button" style={s.link} onClick={() => router.push("/agents")}>
          {t("noAgentsLink")}
        </button>
      </p>
    );
  } else {
    step2 = (
      <div style={s.list}>
        {enabled.map((a) => (
          <AgentCard
            key={a.id}
            agent={a}
            estimate={estById.get(a.id)}
            checked={checked.has(a.id)}
            onChange={(v) => toggle(a.id, v)}
          />
        ))}
      </div>
    );
  }

  return (
    <AppShell crumb={[{ label: t("breadcrumbLab") }, { label: t("breadcrumb") }]}>
      <div style={s.page}>
        <h1 style={s.h1}>{t("title")}</h1>
        <p style={s.subtitle}>{t("subtitle")}</p>

        <section style={s.step}>
          <div style={s.stepHead}>
            <span style={s.stepBadge(true)}>1</span>
            <span style={s.stepTitle(true)}>{t("step1")}</span>
          </div>
          <div style={s.stepBody}>{step1}</div>
        </section>

        <section style={s.step}>
          <div style={s.stepHead}>
            <span style={s.stepBadge(!!prId)}>2</span>
            <span style={s.stepTitle(!!prId)}>{t("step2")}</span>
            {prId && enabled.length > 0 && (
              <button type="button" style={s.link} onClick={() => setChecked(new Set(enabled.map((a) => a.id)))}>
                {t("selectAll")}
              </button>
            )}
          </div>
          <div style={s.stepBody}>{step2}</div>
        </section>

        <div style={s.footer}>
          <Button
            kind="primary"
            icon="Users"
            disabled={!prId || count === 0 || run.isPending}
            loading={run.isPending}
            onClick={start}
          >
            {t("runButton", { count })}
          </Button>
          {prId && count > 0 && (
            <>
              <span style={s.summary}>{t("summary", { time, cost })}</span>
              {sum.agentsWithoutHistory > 0 && (
                <span style={s.note}>{t("withoutHistory", { count: sum.agentsWithoutHistory })}</span>
              )}
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}
