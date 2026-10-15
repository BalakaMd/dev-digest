/* Page states (AC-40..AC-43, AC-63, AC-64): skeletons without invented numbers, error + Retry,
   empty views and the reset-notice. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { srOnly } from "../../../sr-only";
import type { ResetPart } from "../../../../_model/address";

const box = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  gap: 6,
  padding: "40px 24px",
  textAlign: "center",
  border: "1px dashed var(--border-strong)",
  borderRadius: 10,
  background: "var(--bg-surface)",
} as const;

/** AC-40: placeholders only — no number, no zero, no dash. */
export function PageLoading() {
  const t = useTranslations("agentPerformance");
  return (
    <div aria-busy="true" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <span role="status" style={srOnly}>
        {t("states.loading")}
      </span>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 16 }}>
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} height={120} style={{ borderRadius: 10 }} />
        ))}
      </div>
      <Skeleton height={220} style={{ borderRadius: 10 }} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16 }}>
        <Skeleton height={200} style={{ borderRadius: 10 }} />
        <Skeleton height={200} style={{ borderRadius: 10 }} />
      </div>
    </div>
  );
}

/** AC-41 */
export function PageError({ onRetry }: { onRetry: () => void }) {
  const t = useTranslations("agentPerformance");
  return <ErrorState title={t("states.error")} onRetry={onRetry} />;
}

type EmptyProps =
  | { kind: "noRepo" }
  | { kind: "noAgents" }
  | { kind: "noRuns"; repo: string };

/** AC-63 (no repository), AC-43 (no agents), AC-42 (no runs in range). */
export function PageEmpty(props: EmptyProps) {
  const t = useTranslations("agentPerformance");
  const linkStyle = { color: "var(--accent)", fontWeight: 600, fontSize: 13 } as const;
  if (props.kind === "noRepo") {
    return (
      <div style={box}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{t("states.noRepoTitle")}</div>
        <Link href="/onboarding" style={linkStyle}>
          {t("states.noRepoLink")}
        </Link>
      </div>
    );
  }
  if (props.kind === "noAgents") {
    return (
      <div style={box}>
        <div style={{ fontSize: 15, fontWeight: 500 }}>{t("states.noAgentsTitle")}</div>
        <Link href="/agents" style={linkStyle}>
          {t("states.noAgentsLink")}
        </Link>
      </div>
    );
  }
  return (
    <div style={box}>
      <div style={{ fontSize: 15, fontWeight: 500 }}>{t("states.noRunsTitle", { repo: props.repo })}</div>
      <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("states.noRunsHint")}</div>
    </div>
  );
}

/** AC-64: names what was reset. */
export function ResetNotice({ parts }: { parts: readonly ResetPart[] }) {
  const t = useTranslations("agentPerformance");
  if (parts.length === 0) return null;
  const names = parts.map((p) => t(`notice.parts.${p}`)).join(", ");
  return (
    <p
      role="status"
      style={{
        margin: 0,
        padding: "8px 12px",
        fontSize: 13,
        borderRadius: 8,
        border: "1px solid var(--border-strong)",
        background: "var(--bg-elevated)",
        color: "var(--text-secondary)",
      }}
    >
      {t("notice.reset", { parts: names })}
    </p>
  );
}
