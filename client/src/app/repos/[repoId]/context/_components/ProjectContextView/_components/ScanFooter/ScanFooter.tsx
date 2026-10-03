/* ScanFooter — "N files · scanned X ago". `scannedAt` is when the list was last read. */
"use client";

import React from "react";
import { useFormatter, useNow, useTranslations } from "next-intl";
import { NOW_INTERVAL_MS } from "../../constants";

export function ScanFooter({ count, scannedAt }: { count: number; scannedAt: string }) {
  const t = useTranslations("projectContext");
  const format = useFormatter();
  // A reference time keeps next-intl quiet and the label current (client INSIGHTS 2026-09-25).
  const now = useNow({ updateInterval: NOW_INTERVAL_MS });
  return (
    <div
      style={{
        padding: "10px 14px",
        borderTop: "1px solid var(--border)",
        fontSize: 12,
        color: "var(--text-muted)",
        display: "flex",
        alignItems: "center",
        gap: 8,
      }}
    >
      <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 99, background: "var(--ok)" }} />
      <span>{t("footer.summary", { count, when: format.relativeTime(new Date(scannedAt), now) })}</span>
    </div>
  );
}
