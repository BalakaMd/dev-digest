/* RangeControl — "1 day" / "30 days" / "Custom range" (AC-3, AC-4, AC-6).
   A custom range is applied only when valid; otherwise an inline error shows and no read is sent. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { RangeKind } from "../../../../_model/constants";
import { validateCustomRange, type RangeSelection } from "../../../../_model/range";

export interface RangeControlProps {
  value: RangeSelection;
  onChange: (next: RangeSelection) => void;
}

const CHOICES: { kind: RangeKind; key: "oneDay" | "thirtyDays" | "custom" }[] = [
  { kind: "1d", key: "oneDay" },
  { kind: "30d", key: "thirtyDays" },
  { kind: "custom", key: "custom" },
];

const group = { display: "inline-flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" } as const;
const field = { display: "flex", flexDirection: "column", gap: 4, fontSize: 12, color: "var(--text-secondary)" } as const;
const input = {
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid var(--border-strong)",
  background: "var(--bg-surface)",
  color: "var(--text-primary)",
  font: "inherit",
  colorScheme: "dark light",
} as const;

export function RangeControl({ value, onChange }: RangeControlProps) {
  const t = useTranslations("agentPerformance");
  const [customOpen, setCustomOpen] = React.useState(value.kind === "custom");
  const [start, setStart] = React.useState(value.start ?? "");
  const [end, setEnd] = React.useState(value.end ?? "");
  const [error, setError] = React.useState<string | null>(null);

  // Follow the address when it changes from outside (reload, shared link, reset).
  React.useEffect(() => {
    if (value.kind === "custom") {
      setCustomOpen(true);
      setStart(value.start ?? "");
      setEnd(value.end ?? "");
      setError(null);
    } else {
      setCustomOpen(false);
      setError(null);
    }
  }, [value.kind, value.start, value.end]);

  const choose = (kind: RangeKind) => {
    if (kind === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    setError(null);
    onChange({ kind });
  };

  const apply = () => {
    const reason = validateCustomRange(start, end, new Date());
    if (reason) {
      setError(t(`range.errors.${reason}`));
      return;
    }
    setError(null);
    onChange({ kind: "custom", start, end });
  };

  const selected: RangeKind = customOpen ? "custom" : value.kind;

  return (
    <div role="group" aria-label={t("range.label")} style={{ display: "flex", flexDirection: "column", gap: 8, alignItems: "flex-end" }}>
      <div style={group}>
        {CHOICES.map((c) => (
          <Button
            key={c.kind}
            size="sm"
            kind="secondary"
            icon={c.kind === "custom" ? "Calendar" : undefined}
            active={selected === c.kind}
            aria-pressed={selected === c.kind}
            onClick={() => choose(c.kind)}
          >
            {t(`range.${c.key}`)}
          </Button>
        ))}
      </div>
      {customOpen ? (
        <div style={{ display: "flex", gap: 10, alignItems: "flex-end", flexWrap: "wrap", justifyContent: "flex-end" }}>
          <label style={field}>
            {t("range.start")}
            <input
              type="date"
              style={input}
              value={start}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setStart(e.target.value)}
            />
          </label>
          <label style={field}>
            {t("range.end")}
            <input
              type="date"
              style={input}
              value={end}
              aria-invalid={error ? true : undefined}
              onChange={(e) => setEnd(e.target.value)}
            />
          </label>
          <Button size="sm" kind="primary" onClick={apply}>
            {t("range.apply")}
          </Button>
        </div>
      ) : null}
      {error ? (
        <p role="alert" style={{ margin: 0, fontSize: 12, color: "var(--crit)" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}
