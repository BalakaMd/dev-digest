/* ConflictNotice — shown when a save is rejected with 409 (AC-85): the stored
   document changed elsewhere. Shows the newer content (as text) and lets the
   user take it or keep their own text on top of the newer version. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";

export function ConflictNotice({
  content,
  onUseNewer,
  onKeepMine,
}: {
  content: string;
  onUseNewer: () => void;
  onKeepMine: () => void;
}) {
  const t = useTranslations("projectContext.conflict");
  return (
    <div
      role="alert"
      style={{ border: "1px solid var(--warn)", borderRadius: 8, padding: 12, display: "flex", flexDirection: "column", gap: 8 }}
    >
      <strong style={{ fontSize: 13 }}>{t("title")}</strong>
      <p style={{ margin: 0, fontSize: 12.5, color: "var(--text-secondary)" }}>{t("body")}</p>
      <pre
        aria-label={t("newerLabel")}
        className="mono"
        style={{
          margin: 0,
          maxHeight: 180,
          overflow: "auto",
          whiteSpace: "pre-wrap",
          fontSize: 12,
          padding: 8,
          borderRadius: 6,
          background: "var(--bg-elevated)",
        }}
      >
        {content}
      </pre>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <Button kind="secondary" size="sm" onClick={onUseNewer}>
          {t("useNewer")}
        </Button>
        <Button kind="ghost" size="sm" onClick={onKeepMine}>
          {t("keepMine")}
        </Button>
      </div>
    </div>
  );
}
