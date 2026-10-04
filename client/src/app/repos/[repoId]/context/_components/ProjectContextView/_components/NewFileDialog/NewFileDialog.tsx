/* NewFileDialog — asks for a file name and a folder, then hands them to the
   page, which opens an unsaved draft in Edit mode (AC-68). No request is made
   here: the document exists only after its first Save. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Button, Modal, TextInput } from "@devdigest/ui";

export interface NewFileTarget {
  folder: string;
  name: string;
}

/** Normalises user input: trims, drops slashes around the folder, adds `.md`. */
export function toNewFileTarget(nameInput: string, folderInput: string): NewFileTarget | null {
  const name = nameInput.trim();
  if (!name || name.includes("/") || name.includes("\\")) return null;
  return {
    folder: folderInput.trim().replace(/^\/+|\/+$/g, ""),
    name: name.toLowerCase().endsWith(".md") ? name : `${name}.md`,
  };
}

export function NewFileDialog({
  folders,
  defaultFolder,
  onSubmit,
  onClose,
}: {
  /** Known folders, offered as suggestions. */
  folders: string[];
  defaultFolder: string;
  onSubmit: (target: NewFileTarget) => void;
  onClose: () => void;
}) {
  const t = useTranslations("projectContext.newFile");
  const [name, setName] = React.useState("");
  const [folder, setFolder] = React.useState(defaultFolder);
  const [invalid, setInvalid] = React.useState(false);
  const listId = React.useId();

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const target = toNewFileTarget(name, folder);
    if (!target) return setInvalid(true);
    onSubmit(target);
  };

  return createPortal(
    <Modal width={460} title={t("title")} onClose={onClose}>
      <form onSubmit={submit} style={{ padding: "16px 24px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        <label style={{ fontSize: 13 }}>
          {t("name")}
          <TextInput
            mono
            autoFocus
            value={name}
            onChange={(v) => {
              setName(v);
              setInvalid(false);
            }}
            placeholder={t("namePlaceholder")}
            aria-label={t("name")}
            aria-invalid={invalid}
          />
        </label>
        <label style={{ fontSize: 13 }}>
          {t("folder")}
          <TextInput mono value={folder} onChange={setFolder} list={listId} aria-label={t("folder")} />
          <datalist id={listId}>
            {folders.map((f) => (
              <option key={f} value={f} />
            ))}
          </datalist>
        </label>
        <p style={{ margin: 0, fontSize: 12, color: "var(--text-muted)" }}>{t("folderHint")}</p>
        {invalid && (
          <p role="alert" style={{ margin: 0, fontSize: 12.5, color: "var(--crit)" }}>
            {t("errorName")}
          </p>
        )}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
          <Button type="button" kind="ghost" onClick={onClose}>
            {t("cancel")}
          </Button>
          <Button type="submit" kind="primary">
            {t("create")}
          </Button>
        </div>
      </form>
    </Modal>,
    document.body,
  );
}
