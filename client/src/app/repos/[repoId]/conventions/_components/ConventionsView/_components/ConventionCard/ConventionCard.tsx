/* ConventionCard — one extracted convention: category, rule, the verified
   evidence (file:line + code), a confidence bar, and Accept / Reject / Edit.
   Edit turns the card itself into a small form (rule + category) — no page
   change, no modal. A rejected card is dimmed and offers only Restore. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, ProgressBar, SelectInput } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory, ConventionEvidence } from "@devdigest/shared";
import { CONVENTION_CATEGORIES } from "../../convention-categories";
import { confidenceColor, confidencePercent, evidenceRef } from "./evidence-display";
import { s } from "./styles";

export interface ConventionEdit {
  rule: string;
  category: ConventionCategory;
}

export function ConventionCard({
  candidate,
  onToggleAccept,
  onReject,
  onSave,
  onRestore,
}: {
  candidate: ConventionCandidate;
  onToggleAccept: () => void;
  onReject: () => void;
  onSave: (edit: ConventionEdit) => void;
  onRestore: () => void;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState<ConventionEdit | null>(null);
  const [showAll, setShowAll] = React.useState(false);
  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";
  const [primary, ...others] = candidate.evidence;
  const shown = showAll ? candidate.evidence : primary ? [primary] : [];
  const color = confidenceColor(candidate.confidence);

  const save = () => {
    if (!editing || !editing.rule.trim()) return;
    onSave({ rule: editing.rule.trim(), category: editing.category });
    setEditing(null);
  };

  return (
    <article style={s.card(accepted, rejected)} data-testid={`convention-${candidate.id}`}>
      <div style={s.main}>
        {editing ? (
          <div style={s.editForm}>
            <label style={s.fieldLabel}>
              {t("card.rule")}
              <textarea
                value={editing.rule}
                onChange={(e) => setEditing({ ...editing, rule: e.target.value })}
                aria-label={t("card.rule")}
                rows={2}
                style={s.ruleInput}
                autoFocus
              />
            </label>
            <div style={s.fieldLabel}>
              {t("card.category")}
              <SelectInput
                value={editing.category}
                onChange={(v) => setEditing({ ...editing, category: v as ConventionCategory })}
                options={CONVENTION_CATEGORIES.map((c) => ({ value: c, label: t(`category.${c}`) }))}
                mono={false}
              />
            </div>
            <div style={s.editActions}>
              <Button kind="ghost" size="sm" onClick={() => setEditing(null)}>
                {t("card.cancel")}
              </Button>
              <Button kind="primary" size="sm" icon="Check" onClick={save} disabled={!editing.rule.trim()}>
                {t("card.save")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={s.titleRow}>
              <Badge>{t(`category.${candidate.category}`)}</Badge>
              {rejected && (
                <Badge color="var(--crit)" bg="var(--crit-bg)" icon="XCircle">
                  {t("card.rejected")}
                </Badge>
              )}
            </div>
            <h3 style={s.rule}>{candidate.rule}</h3>
          </>
        )}

        {shown.map((e) => (
          <EvidenceBlock key={`${e.path}:${e.line_start}`} evidence={e} />
        ))}
        {others.length > 0 && (
          <button type="button" style={s.moreBtn} onClick={() => setShowAll((v) => !v)}>
            {showAll ? <Icon.ChevronDown size={12} /> : <Icon.ChevronRight size={12} />}
            {t("card.moreEvidence", { count: others.length })}
          </button>
        )}

        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar value={confidencePercent(candidate.confidence)} color={color} height={5} />
          </div>
          <span className="mono" style={s.confidenceValue}>
            {confidencePercent(candidate.confidence)}%
          </span>
        </div>
      </div>

      {rejected ? (
        <div style={s.actions}>
          <Button kind="secondary" size="sm" icon="History" full onClick={onRestore}>
            {t("card.restore")}
          </Button>
        </div>
      ) : (
        <div style={s.actions}>
          <Button
            kind={accepted ? "primary" : "secondary"}
            size="sm"
            icon="Check"
            full
            onClick={onToggleAccept}
            aria-pressed={accepted}
          >
            {accepted ? t("card.accepted") : t("card.accept")}
          </Button>
          <Button kind="ghost" size="sm" icon="X" full onClick={onReject}>
            {t("card.reject")}
          </Button>
          <Button
            kind="ghost"
            size="sm"
            icon="Edit"
            full
            disabled={editing !== null}
            onClick={() => setEditing({ rule: candidate.rule, category: candidate.category })}
          >
            {t("card.edit")}
          </Button>
        </div>
      )}
    </article>
  );
}

function EvidenceBlock({ evidence }: { evidence: ConventionEvidence }) {
  const t = useTranslations("conventions");
  const [copied, setCopied] = React.useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(evidence.snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard unavailable (insecure context / denied) — nothing to do.
    }
  };

  return (
    <div style={s.evidence}>
      <div style={s.evidenceHeader}>
        <span className="mono" style={s.evidencePath}>
          {evidenceRef(evidence)}
        </span>
        <button
          type="button"
          onClick={() => void copy()}
          style={s.copyBtn}
          aria-label={t("card.copy")}
          title={copied ? t("card.copied") : t("card.copy")}
        >
          {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
        </button>
      </div>
      <pre className="mono" style={s.code}>
        {evidence.snippet}
      </pre>
    </div>
  );
}
