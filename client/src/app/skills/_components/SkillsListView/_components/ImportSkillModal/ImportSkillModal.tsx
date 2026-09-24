/* ImportSkillModal — "Add → Import". Two steps: pick a .md / .zip, then review
   the preview the server extracted (rendered core, editable fields, the archive
   members that were NOT imported) and confirm. Nothing is saved before Confirm;
   nothing in an archive is ever executed. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, Modal } from "@devdigest/ui";
import type { SkillImportPreview } from "@devdigest/shared";
import { useCreateSkill, useImportSkillPreview } from "../../../../../../lib/hooks/skills";
import { ApiError } from "../../../../../../lib/api";
import { useToast } from "../../../../../../lib/toast";
import { isDraftComplete, type SkillDraft } from "../../../../skill-model";
import { SkillFields } from "../../../SkillFields";
import { IMPORT_ACCEPT, readFileAsBase64 } from "./read-file";
import { s } from "./styles";

export function ImportSkillModal({ onClose }: { onClose: () => void }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const toast = useToast();
  const parse = useImportSkillPreview();
  const create = useCreateSkill();
  const [preview, setPreview] = React.useState<SkillImportPreview | null>(null);
  const [draft, setDraft] = React.useState<SkillDraft | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    try {
      const contentB64 = await readFileAsBase64(file);
      const result = await parse.mutateAsync({ filename: file.name, contentB64 });
      setPreview(result);
      setDraft({ name: result.name, description: result.description, type: result.type, body: result.body });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t("import.parseError"));
    }
  };

  const confirm = async () => {
    if (!draft || !preview) return;
    try {
      const skill = await create.mutateAsync({ ...draft, name: draft.name.trim(), source: preview.source });
      toast.success(t("import.saved", { name: skill.name }));
      onClose();
      router.push(`/skills/${skill.id}?tab=preview`);
    } catch {
      // Surfaced by the global mutation-error toast (lib/providers.tsx).
    }
  };

  const reset = () => {
    setPreview(null);
    setDraft(null);
    setError(null);
  };

  return (
    <Modal
      width={820}
      title={t("import.title")}
      subtitle={t("import.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          {preview && (
            <Button kind="ghost" icon="ChevronLeft" onClick={reset}>
              {t("import.back")}
            </Button>
          )}
          <span style={{ flex: 1 }} />
          <Button kind="ghost" onClick={onClose}>
            {t("import.cancel")}
          </Button>
          {preview && draft && (
            <Button
              kind="primary"
              icon="Check"
              onClick={confirm}
              disabled={!isDraftComplete(draft) || create.isPending}
              loading={create.isPending}
            >
              {create.isPending ? t("import.saving") : t("import.confirm")}
            </Button>
          )}
        </div>
      }
    >
      <div style={s.body}>
        <div style={s.trust}>
          <Icon.AlertTriangle size={15} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span>{t("import.trust")}</span>
        </div>

        {!preview && (
          <label style={s.drop}>
            <Icon.Upload size={22} style={{ color: "var(--text-muted)" }} />
            <span style={s.dropTitle}>{parse.isPending ? t("import.parsing") : t("import.pick")}</span>
            <span style={s.dropHint}>{t("import.pickHint")}</span>
            <input
              type="file"
              accept={IMPORT_ACCEPT}
              aria-label={t("import.pick")}
              disabled={parse.isPending}
              onChange={(e) => void onFile(e.target.files?.[0])}
              style={s.fileInput}
            />
          </label>
        )}
        {error && <div role="alert" style={s.error}>{error}</div>}

        {preview && draft && (
          <>
            {preview.warnings.map((w) => (
              <div key={w} role="alert" style={s.warning}>
                <Icon.AlertTriangle size={14} style={{ flexShrink: 0 }} />
                {w}
              </div>
            ))}
            {preview.ignored_entries.length > 0 && (
              <div>
                <h3 style={s.sectionTitle}>
                  {t("import.ignored", { count: preview.ignored_entries.length })}
                </h3>
                <div style={s.ignored}>
                  {preview.ignored_entries.map((entry) => (
                    <Badge key={entry} mono color="var(--text-muted)">
                      {entry}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
            <div style={s.columns}>
              <div style={s.column}>
                <SkillFields draft={draft} onChange={setDraft} bodyRows={10} />
              </div>
              <div style={s.column}>
                <h3 style={s.sectionTitle}>{t("import.preview")}</h3>
                <div style={s.markdown}>
                  <Markdown>{draft.body}</Markdown>
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
