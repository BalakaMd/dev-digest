import type {
  ContextDocContent,
  ContextDocList,
  ContextDocSource,
  ContextDocUsage,
  GitClient,
  LocalDocCount,
  LocalDocUploadBody,
  LocalDocUploadResult,
  LocalDocWriteBody,
} from '@devdigest/shared';
import {
  CONTEXT_DOC_MAX_ATTACHMENTS,
  CONTEXT_DOC_MAX_BYTES,
  CONTEXT_DOC_TOKEN_BUDGET,
} from '@devdigest/shared';
import type { ContextDocScope, ContextDocStore } from '../../adapters/context-docs/types.js';
import { ConflictError, ExternalServiceError, NotFoundError } from '../../platform/errors.js';
import type { ContextAttachments } from '../agents/repository.js';
import { NOT_CLONED_MESSAGE, SYNC_FAILED_MESSAGE } from './constants.js';
import {
  computeUsage,
  decodeUploadContent,
  joinDocPath,
  mapStoreErrors,
  rejectionReason,
} from './helpers.js';
import type { ContextDocsRepo } from './repository.js';

/** What the service needs from the repos lookup (implemented by ContextDocsRepository). */
export interface RepoLookup {
  getRepo(workspaceId: string, id: string): Promise<ContextDocsRepo | undefined>;
}

/** What the service needs from the agents module's repository (via the container). */
export interface AttachmentSource {
  contextAttachments(workspaceId: string): Promise<ContextAttachments>;
}

export interface ContextDocsServiceDeps {
  store: ContextDocStore;
  git: Pick<GitClient, 'sync'>;
  agents: AttachmentSource;
  repos: RepoLookup;
}

/**
 * Project context documents use cases. Every method resolves the repo through
 * the workspace-scoped lookup first (404 when absent), then talks to the store
 * with repo-relative paths only. Store errors are mapped to the HTTP taxonomy;
 * no fs message or absolute path reaches a caller (AC-5).
 */
export class ContextDocsService {
  constructor(private deps: ContextDocsServiceDeps) {}

  private async scope(
    workspaceId: string,
    repoId: string,
  ): Promise<{ repo: ContextDocsRepo; scope: ContextDocScope }> {
    const repo = await this.deps.repos.getRepo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    return { repo, scope: { repoId: repo.id, repo: { owner: repo.owner, name: repo.name } } };
  }

  async list(workspaceId: string, repoId: string): Promise<ContextDocList> {
    const { scope } = await this.scope(workspaceId, repoId);
    const res = await mapStoreErrors(() => this.deps.store.list(scope));
    return {
      state: res.state,
      docs: res.docs,
      local_folders: res.local_folders,
      truncated: res.truncated,
      search_globs: this.deps.store.searchRoots(),
      limits: {
        max_doc_bytes: CONTEXT_DOC_MAX_BYTES,
        max_attachments: CONTEXT_DOC_MAX_ATTACHMENTS,
        token_budget: CONTEXT_DOC_TOKEN_BUDGET,
      },
      scanned_at: new Date().toISOString(),
    };
  }

  async read(
    workspaceId: string,
    repoId: string,
    path: string,
    source?: ContextDocSource,
  ): Promise<ContextDocContent> {
    const { scope } = await this.scope(workspaceId, repoId);
    return mapStoreErrors(() => this.deps.store.read(scope, path, source));
  }

  async usage(workspaceId: string, repoId: string, path: string): Promise<ContextDocUsage> {
    await this.scope(workspaceId, repoId);
    const att = await this.deps.agents.contextAttachments(workspaceId);
    return computeUsage(att, path);
  }

  /** Synchronous working-copy sync (Q-2 option 1): fetch, then align to the branch tip. */
  async sync(workspaceId: string, repoId: string): Promise<{ head: string }> {
    const { repo } = await this.scope(workspaceId, repoId);
    if (!repo.cloned) throw new ConflictError(NOT_CLONED_MESSAGE);
    try {
      return await this.deps.git.sync({ owner: repo.owner, name: repo.name }, repo.defaultBranch);
    } catch {
      // Raw errors from the VCS client can embed the clone path; return a fixed message.
      throw new ExternalServiceError(SYNC_FAILED_MESSAGE);
    }
  }

  async localCount(workspaceId: string, repoId: string): Promise<LocalDocCount> {
    const { repo } = await this.scope(workspaceId, repoId);
    return { count: await mapStoreErrors(() => this.deps.store.countLocal(repo.id)) };
  }

  async writeLocal(
    workspaceId: string,
    repoId: string,
    body: LocalDocWriteBody,
  ): Promise<ContextDocContent> {
    const { scope } = await this.scope(workspaceId, repoId);
    return mapStoreErrors(() =>
      this.deps.store.writeLocal(scope, {
        folder: body.folder,
        name: body.name,
        content: body.content,
        baseVersion: body.base_version,
        override: body.override_repo ? { originVersion: body.origin_version! } : undefined,
      }),
    );
  }

  /** "Keep my copy": the store records the current repository text's version as the copy's origin. */
  async keepCopy(workspaceId: string, repoId: string, path: string): Promise<void> {
    const { scope } = await this.scope(workspaceId, repoId);
    await mapStoreErrors(() => this.deps.store.keepOrigin(scope, path));
  }

  /** Each file is validated and stored separately; failures are reported by name (AC-70). */
  async upload(
    workspaceId: string,
    repoId: string,
    body: LocalDocUploadBody,
  ): Promise<LocalDocUploadResult> {
    const { scope } = await this.scope(workspaceId, repoId);
    const stored: string[] = [];
    const rejected: LocalDocUploadResult['rejected'] = [];
    for (const file of body.files) {
      try {
        const content = decodeUploadContent(file.content_b64);
        await this.deps.store.writeLocal(scope, { folder: body.folder, name: file.name, content });
        stored.push(joinDocPath(body.folder, file.name));
      } catch (err) {
        rejected.push({ name: file.name, reason: rejectionReason(err) });
      }
    }
    return { stored, rejected };
  }

  async createFolder(workspaceId: string, repoId: string, path: string): Promise<{ path: string }> {
    const { scope } = await this.scope(workspaceId, repoId);
    return { path: await mapStoreErrors(() => this.deps.store.createLocalFolder(scope, path)) };
  }

  async deleteLocal(workspaceId: string, repoId: string, path: string): Promise<void> {
    const { scope } = await this.scope(workspaceId, repoId);
    await mapStoreErrors(() => this.deps.store.deleteLocal(scope, path));
  }

  async deleteFolder(workspaceId: string, repoId: string, path: string): Promise<void> {
    const { scope } = await this.scope(workspaceId, repoId);
    await mapStoreErrors(() => this.deps.store.deleteLocalFolder(scope, path));
  }
}
