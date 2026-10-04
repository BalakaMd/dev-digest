/* DocTree — left panel: header, toolbar (New file / folder / Upload via `toolbarExtra`, refresh, Sync with GitHub) and the
   documents grouped by folder. Presentational; the view owns selection and
   the refresh/sync state. Paths are rendered as text only. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Icon, IconBtn } from "@devdigest/ui";
import type { ContextDocEntry } from "@devdigest/shared";
import { fileName, sameDoc, type DocGroup, type DocSelection } from "../../doc-groups";
import { s } from "./styles";

export interface DocTreeProps {
  groups: DocGroup[];
  selected: DocSelection | null;
  /** Search roots shown under the title (e.g. `.devdigest/specs/`). */
  globs: string[];
  truncated: boolean;
  syncing: boolean;
  refreshing: boolean;
  onSelect: (doc: ContextDocEntry) => void;
  onRefresh: () => void;
  onSync: () => void;
  /** Removes an empty local folder (shown only for empty folders). */
  onDeleteFolder?: (folder: string) => void;
  /** Extra toolbar buttons (New file / New folder / Upload — added by the editing step). */
  toolbarExtra?: React.ReactNode;
  children?: React.ReactNode;
}

export function DocTree({
  groups,
  selected,
  globs,
  truncated,
  syncing,
  refreshing,
  onSelect,
  onRefresh,
  onSync,
  onDeleteFolder,
  toolbarExtra,
  children,
}: DocTreeProps) {
  const t = useTranslations("projectContext");
  return (
    <>
      <div style={s.head}>
        <div style={s.title}>{t("page.treeTitle")}</div>
        {globs.length > 0 && <div style={s.globs}>{globs.join(", ")}</div>}
      </div>
      <div style={s.toolbar} role="toolbar" aria-label={t("page.treeTitle")}>
        {toolbarExtra}
        <IconBtn
          icon="RefreshCw"
          label={refreshing ? t("toolbar.refreshing") : t("toolbar.refresh")}
          onClick={refreshing ? undefined : onRefresh}
        />
        <button
          type="button"
          title={syncing ? t("toolbar.syncing") : t("toolbar.sync")}
          aria-label={syncing ? t("toolbar.syncing") : t("toolbar.sync")}
          disabled={syncing}
          aria-busy={syncing}
          onClick={onSync}
          style={s.syncBtn(syncing)}
        >
          <Icon.GitBranch size={16} />
        </button>
      </div>
      {truncated && <p style={{ margin: "0 14px 6px", fontSize: 12, color: "var(--text-muted)" }}>{t("page.truncated")}</p>}
      <nav style={s.list} aria-label={t("page.treeLabel")}>
        {groups.map((g) => (
          <div key={g.folder}>
            <div style={s.folder}>
              <Icon.Folder size={13} />
              <span style={{ flex: 1 }}>{g.folder === "" ? t("tree.rootFolder") : g.folder}</span>
              {g.docs.length === 0 && g.folder !== "" && onDeleteFolder && (
                <IconBtn
                  icon="Trash"
                  size={22}
                  label={t("toolbar.deleteFolder", { folder: g.folder })}
                  onClick={() => onDeleteFolder(g.folder)}
                />
              )}
            </div>
            {g.docs.length === 0 && <div style={s.emptyFolder}>{t("tree.localFolderEmpty")}</div>}
            {g.docs.map((d) => {
              const isSel = sameDoc(d, selected);
              return (
                <button
                  key={`${d.source}:${d.path}`}
                  type="button"
                  style={s.row(isSel)}
                  aria-current={isSel ? "true" : undefined}
                  title={d.path}
                  onClick={() => onSelect(d)}
                >
                  <Icon.FileText size={14} />
                  <span style={s.name}>{fileName(d.path)}</span>
                  {d.source === "local" && (
                    <span title={t("tree.localTitle")}>
                      <Badge style={s.badge} color="var(--accent)">
                        {t("tree.local")}
                      </Badge>
                    </span>
                  )}
                  {d.overrides_repo && (
                    <span title={t("tree.overridesRepoTitle")}>
                      <Badge style={s.badge} color="var(--accent)">
                        {t("tree.overridesRepo")}
                      </Badge>
                    </span>
                  )}
                  {d.repo_changed && (
                    <span title={t("tree.repoChangedTitle")}>
                      <Badge style={s.badge} color="var(--warn)">
                        {t("tree.repoChanged")}
                      </Badge>
                    </span>
                  )}
                  {d.overridden && (
                    <span title={t("tree.overriddenTitle")}>
                      <Badge style={s.badge} color="var(--text-muted)">
                        {t("tree.overridden")}
                      </Badge>
                    </span>
                  )}
                  {d.too_large && (
                    <Badge style={s.badge} color="var(--crit)">
                      {t("tree.tooLarge")}
                    </Badge>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>
      {children}
    </>
  );
}
