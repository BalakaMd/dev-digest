/* AgentPicker — "Run Review" popover on the PR page: tick the agents to run,
   then start one multi-agent review and open its result page. */
"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox } from "@devdigest/ui";
import { useAgents } from "../../../../../../../lib/hooks/agents";
import { useRunReview } from "../../../../../../../lib/hooks/reviews";
import { useReviewEstimates } from "../../../../../../../lib/hooks/multi-agent-review";
import { formatEstimate } from "./helpers";
import { s } from "./styles";

export function AgentPicker({
  prId,
  warnMerged = false,
  onRunsStarted,
}: {
  prId: string;
  /** PR is already merged/closed — dim the trigger and warn, but still allow. */
  warnMerged?: boolean;
  /** Fired after the trigger succeeded, before navigating to the result page. */
  onRunsStarted?: () => void;
}) {
  const t = useTranslations("prReview");
  const tp = useTranslations("agentPicker");
  const router = useRouter();
  const panelId = useId();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [checked, setChecked] = useState<ReadonlySet<string>>(new Set());
  const { data: agents } = useAgents();
  const { data: estimates } = useReviewEstimates();
  const run = useRunReview();

  const enabled = (agents ?? []).filter((a) => a.enabled);
  const durationById = new Map((estimates?.estimates ?? []).map((e) => [e.agent_id, e.duration_ms]));
  const count = enabled.filter((a) => checked.has(a.id)).length;

  const close = useCallback(() => {
    setOpen(false);
    setChecked(new Set());
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  const toggle = (id: string, v: boolean) =>
    setChecked((prev) => {
      const next = new Set(prev);
      if (v) next.add(id);
      else next.delete(id);
      return next;
    });

  const start = async () => {
    if (inFlight.current || count === 0) return;
    inFlight.current = true;
    try {
      const res = await run.mutateAsync({
        prId,
        agentIds: enabled.filter((a) => checked.has(a.id)).map((a) => a.id),
      });
      onRunsStarted?.();
      close();
      if (res.multi_agent_run_id) router.push(`/multi-agent-review/${res.multi_agent_run_id}`);
    } catch {
      // Global error toast reports it; keep the panel open for a retry.
    } finally {
      inFlight.current = false;
    }
  };

  return (
    <div style={s.root} ref={rootRef}>
      <span
        title={warnMerged ? t("runReview.mergedTooltip") : undefined}
        style={warnMerged ? { opacity: 0.6 } : undefined}
      >
        <Button
          kind="primary"
          size="sm"
          icon="Sparkles"
          iconRight="ChevronDown"
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-controls={open ? panelId : undefined}
          onClick={() => (open ? close() : setOpen(true))}
        >
          {t("runReview.runReview")}
        </Button>
      </span>
      {open && (
        <div id={panelId} role="dialog" aria-label={tp("panelLabel")} style={s.panel}>
          {warnMerged && <div style={s.warning}>{t("runReview.mergedWarning")}</div>}
          {enabled.length === 0 ? (
            <div style={s.empty}>
              <span>{t("runReview.noEnabledAgents")}</span>
              <button type="button" style={s.link} onClick={() => router.push("/agents")}>
                {tp("noEnabledLink")}
              </button>
            </div>
          ) : (
            <>
              <div style={s.head}>
                <span style={s.title}>{tp("title")}</span>
                <button type="button" style={s.clear} onClick={() => setChecked(new Set())}>
                  {tp("clear")}
                </button>
              </div>
              <div style={s.list}>
                {enabled.map((a) => {
                  const est = formatEstimate(durationById.get(a.id));
                  return (
                    <div key={a.id} style={s.row}>
                      <Checkbox checked={checked.has(a.id)} onChange={(v) => toggle(a.id, v)} label={a.name} />
                      <span style={s.estimate} aria-label={tp("estimateAria", { value: est })}>
                        {est}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div style={s.runWrap}>
                <Button
                  kind="primary"
                  size="sm"
                  icon="Users"
                  disabled={count === 0 || run.isPending}
                  loading={run.isPending}
                  onClick={start}
                >
                  {tp("runButton", { count })}
                </Button>
              </div>
              <div style={s.footer}>
                <button type="button" style={s.link} onClick={() => router.push("/agents")}>
                  {t("runReview.configureAgents")}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
