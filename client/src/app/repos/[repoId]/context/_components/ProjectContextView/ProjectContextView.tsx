/* ProjectContextView — /repos/:repoId/context. Documents of
   the repository (and local overlay) grouped by folder on the left, the
   selected document with usage and coverage on the right. The selected
   document lives in the URL (`?doc=<path>`); the first document is used when
   it is absent or unlisted. Refresh re-reads the list only; "Sync with
   GitHub" is a separate, confirmed action. Local overlay documents can be
   edited, created, uploaded and deleted; unsaved edits are guarded. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { EmptyState, ErrorState, IconBtn, Skeleton } from "@devdigest/ui";
import type { ContextDocContent, ContextDocEntry } from "@devdigest/shared";
import { AppShell } from "@/components/app-shell";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { RepoNotFound } from "@/components/repo-not-found";
import { useContextDocs, useSyncRepoDocs } from "@/lib/hooks/context-docs";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { DocTree } from "./_components/DocTree";
import { DocViewer } from "./_components/DocViewer";
import { DeleteDocDialog, type DeleteTarget } from "./_components/DeleteDocDialog/DeleteDocDialog";
import { DocEditor } from "./_components/DocEditor";
import { NewFileDialog, type NewFileTarget } from "./_components/NewFileDialog/NewFileDialog";
import { NewFolderDialog } from "./_components/NewFolderDialog";
import { ScanFooter } from "./_components/ScanFooter";
import { UnsavedChangesDialog } from "./_components/UnsavedChangesDialog";
import { UploadDialog } from "./_components/UploadDialog";
import { DOC_PARAM, SOURCE_PARAM } from "./constants";
import { groupDocs, resolveSelection } from "./doc-groups";
import { s } from "./styles";
import { useUnsavedGuard } from "./useUnsavedGuard";

type Dialog = "newFile" | "newFolder" | "upload" | null;

export function ProjectContextView({ repoId }: { repoId: string }) {
  const t = useTranslations("projectContext");
  const router = useRouter();
  const searchParams = useSearchParams();
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);
  const list = useContextDocs(repoId);
  const sync = useSyncRepoDocs(repoId);
  const [confirmingSync, setConfirmingSync] = React.useState(false);
  const [announcement, setAnnouncement] = React.useState("");
  const [dirty, setDirty] = React.useState(false);
  const [dialog, setDialog] = React.useState<Dialog>(null);
  const [deleting, setDeleting] = React.useState<DeleteTarget | null>(null);
  // Unsaved new document (AC-68): exists only on this page until its first Save.
  const [draft, setDraft] = React.useState<NewFileTarget | null>(null);
  const { guard, prompting, discard, keepEditing } = useUnsavedGuard(dirty);

  const repoName = activeRepo?.full_name ?? t("page.repoFallback");
  const crumb = [
    { label: repoName, mono: true, href: `/repos/${repoId}/pulls` },
    { label: t("page.crumb") },
  ];

  const data = list.data;
  const docs = React.useMemo(() => data?.docs ?? [], [data]);
  const selectedDoc = resolveSelection(docs, searchParams.get(DOC_PARAM), searchParams.get(SOURCE_PARAM));
  const groups = React.useMemo(() => groupDocs(docs, data?.local_folders ?? []), [docs, data]);

  const urlFor = React.useCallback(
    (doc: ContextDocEntry) => {
      const sp = new URLSearchParams(searchParams.toString());
      sp.set(DOC_PARAM, doc.path);
      if (doc.source === "local" && doc.shadowed) sp.set(SOURCE_PARAM, "local");
      else sp.delete(SOURCE_PARAM);
      return `/repos/${repoId}/context?${sp.toString()}`;
    },
    [repoId, searchParams],
  );

  // Keep the URL in step with the resolved selection (AC-73): a missing or
  // unlisted `?doc=` is replaced by the first document.
  const urlPath = searchParams.get(DOC_PARAM);
  React.useEffect(() => {
    if (selectedDoc && urlPath !== selectedDoc.path) router.replace(urlFor(selectedDoc));
  }, [selectedDoc, urlPath, router, urlFor]);

  const select = (d: ContextDocEntry) =>
    guard(() => {
      setDraft(null);
      router.replace(urlFor(d));
    });

  const openDraft = (target: NewFileTarget) => {
    setDialog(null);
    guard(() => setDraft(target));
  };

  const draftSaved = (saved: ContextDocContent) => {
    setDraft(null);
    setAnnouncement(t("live.saved"));
    const sp = new URLSearchParams(searchParams.toString());
    sp.set(DOC_PARAM, saved.path);
    sp.delete(SOURCE_PARAM);
    router.replace(`/repos/${repoId}/context?${sp.toString()}`);
  };

  if (repoNotFound) {
    return (
      <AppShell crumb={crumb}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const refresh = async () => {
    const res = await list.refetch();
    if (!res.isError) setAnnouncement(t("live.refreshed"));
  };

  const runSync = () => {
    setConfirmingSync(false);
    setAnnouncement(t("sync.running"));
    sync.mutate(undefined, {
      onSuccess: () => setAnnouncement(t("sync.done")),
      onError: () => setAnnouncement(t("sync.failed")),
    });
  };

  const globs = data?.search_globs ?? [];
  const tree = data && data.state === "ok" && (
    <DocTree
      groups={groups}
      selected={selectedDoc ? { path: selectedDoc.path, source: selectedDoc.source } : null}
      globs={globs}
      truncated={data.truncated}
      syncing={sync.isPending}
      refreshing={list.isFetching && !sync.isPending}
      onSelect={select}
      onRefresh={() => void refresh()}
      onSync={() => setConfirmingSync(true)}
      onDeleteFolder={(folder) => setDeleting({ kind: "folder", path: folder })}
      toolbarExtra={
        <>
          <IconBtn icon="Plus" label={t("toolbar.newFile")} onClick={() => setDialog("newFile")} />
          <IconBtn icon="Folder" label={t("toolbar.newFolder")} onClick={() => setDialog("newFolder")} />
          <IconBtn icon="Upload" label={t("toolbar.upload")} onClick={() => setDialog("upload")} />
        </>
      }
    >
      {sync.isError && (
        <div role="alert" style={s.banner}>
          <span>{t("sync.failed")}</span>
          <button type="button" style={{ textDecoration: "underline", color: "var(--accent)" }} onClick={runSync}>
            {t("sync.retry")}
          </button>
        </div>
      )}
      <ScanFooter count={docs.length} scannedAt={data.scanned_at} />
    </DocTree>
  );

  let left: React.ReactNode;
  let right: React.ReactNode;
  if (list.isLoading) {
    left = (
      <div style={s.skeletons} aria-busy="true">
        <Skeleton height={20} />
        <Skeleton height={20} />
        <Skeleton height={20} />
      </div>
    );
    right = (
      <div style={s.skeletons} aria-busy="true">
        <Skeleton height={28} />
        <Skeleton height={160} />
      </div>
    );
  } else if (!data) {
    right = <ErrorState body={t("page.loadError")} onRetry={() => void list.refetch()} />;
  } else if (data.state === "not_cloned") {
    right = <EmptyState icon="GitBranch" title={t("page.notClonedTitle")} body={t("page.notClonedBody")} />;
  } else if (docs.length === 0 && data.local_folders.length === 0) {
    left = tree;
    right = (
      <EmptyState
        icon="FileText"
        title={t("page.emptyTitle")}
        body={globs.length > 0 ? t("page.emptyBody", { globs: globs.join(", ") }) : t("page.emptyNoGlobs")}
      />
    );
  } else {
    left = tree;
    right = selectedDoc ? (
      <DocViewer
        key={`${selectedDoc.source}:${selectedDoc.path}`}
        repoId={repoId}
        doc={selectedDoc}
        guard={guard}
        onDirtyChange={setDirty}
        onDelete={(d) => setDeleting({ kind: "doc", path: d.path })}
        onSaved={() => setAnnouncement(t("live.saved"))}
        onConflict={() => setAnnouncement(t("live.conflict"))}
      />
    ) : (
      <p style={s.centered}>{t("page.noSelection")}</p>
    );
  }

  if (draft && data?.state === "ok") {
    right = (
      <DocEditor
        key={`draft:${draft.folder}/${draft.name}`}
        repoId={repoId}
        folder={draft.folder}
        name={draft.name}
        existing={false}
        onSaved={draftSaved}
        onCancel={() => guard(() => setDraft(null))}
        onDirtyChange={setDirty}
        onConflict={() => setAnnouncement(t("live.conflict"))}
      />
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.page}>
        {/* aria-live regions must exist before their text changes. */}
        <div aria-live="polite" role="status" style={s.live}>
          {announcement}
        </div>
        {left && <aside style={s.left}>{left}</aside>}
        <section style={s.right}>{right}</section>
      </div>
      {dialog === "newFile" && (
        <NewFileDialog
          folders={groups.map((g) => g.folder)}
          defaultFolder={selectedDoc?.folder ?? ""}
          onSubmit={openDraft}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "newFolder" && (
        <NewFolderDialog
          repoId={repoId}
          onCreated={() => {
            setDialog(null);
            setAnnouncement(t("newFolder.done"));
          }}
          onClose={() => setDialog(null)}
        />
      )}
      {dialog === "upload" && (
        <UploadDialog
          repoId={repoId}
          defaultFolder={selectedDoc?.folder ?? ""}
          onDone={() => setAnnouncement(t("live.uploaded"))}
          onClose={() => setDialog(null)}
        />
      )}
      {deleting && (
        <DeleteDocDialog
          repoId={repoId}
          target={deleting}
          onDeleted={() => {
            setDeleting(null);
            setAnnouncement(t("live.deleted"));
          }}
          onClose={() => setDeleting(null)}
        />
      )}
      {prompting && <UnsavedChangesDialog onDiscard={discard} onKeep={keepEditing} />}
      {confirmingSync && (
        <ConfirmDialog
          tone="primary"
          title={t("sync.confirmTitle")}
          body={t("sync.confirmBody")}
          confirmLabel={t("sync.confirmLabel")}
          onConfirm={runSync}
          onCancel={() => setConfirmingSync(false)}
        />
      )}
    </AppShell>
  );
}
