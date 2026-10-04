import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ContextDocContent,
  ContextDocList,
  ContextDocPath,
  ContextDocPathQuery,
  ContextDocSyncResult,
  ContextDocUsage,
  KeepCopyBody,
  LocalDocCount,
  LocalDocUploadBody,
  LocalDocUploadResult,
  LocalDocWriteBody,
  LocalFolderBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { UPLOAD_BODY_LIMIT_BYTES } from './constants.js';

/**
 * Project context documents (SPEC-01). All routes are workspace-scoped and
 * address documents by repo-relative path + source only. A local document at a
 * repo document's path overrides it (local wins); the list derives the marks and
 * may record a missing origin (overlay only) on a GET. Revert = DELETE …/local.
 *
 *   GET    /repos/:id/context-docs                → list (repo + local), `state:'not_cloned'` when no clone
 *   GET    /repos/:id/context-docs/content        → ?path&source? one document's content
 *   GET    /repos/:id/context-docs/usage          → ?path  attachments / used-by / coverage
 *   POST   /repos/:id/context-docs/sync           → sync the working copy with GitHub → {head}
 *   GET    /repos/:id/context-docs/local-count    → {count} of local documents
 *   PUT    /repos/:id/context-docs/local          → create / update one local document
 *                                                   (`override_repo` + `origin_version` = "Edit a copy" of a repo doc, SPEC-02)
 *   POST   /repos/:id/context-docs/local/keep-copy → {path} record the repo text as the copy's origin → {ok}
 *   POST   /repos/:id/context-docs/local/upload   → store several files (per-file result)
 *   POST   /repos/:id/context-docs/local/folders  → create an (empty) local folder
 *   DELETE /repos/:id/context-docs/local          → ?path delete a local document
 *   DELETE /repos/:id/context-docs/local/folders  → ?path delete an empty local folder
 */

const PathQuery = z.object({ path: ContextDocPath });
const FolderQuery = z.object({ path: z.string().min(1).max(512) });
const FolderResult = z.object({ path: z.string() });
const Ok = z.object({ ok: z.literal(true) });

export default async function contextDocsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const c = app.container;
  const service = c.contextDocsService;
  const base = '/repos/:id/context-docs';

  app.get(base, { schema: { params: IdParams, response: { 200: ContextDocList } } }, async (req) => {
    const { workspaceId } = await getContext(c, req);
    return service.list(workspaceId, req.params.id);
  });

  app.get(
    `${base}/content`,
    { schema: { params: IdParams, querystring: ContextDocPathQuery, response: { 200: ContextDocContent } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.read(workspaceId, req.params.id, req.query.path, req.query.source);
    },
  );

  app.get(
    `${base}/usage`,
    { schema: { params: IdParams, querystring: PathQuery, response: { 200: ContextDocUsage } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.usage(workspaceId, req.params.id, req.query.path);
    },
  );

  app.post(
    `${base}/sync`,
    { schema: { params: IdParams, response: { 200: ContextDocSyncResult } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.sync(workspaceId, req.params.id);
    },
  );

  app.get(
    `${base}/local-count`,
    { schema: { params: IdParams, response: { 200: LocalDocCount } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.localCount(workspaceId, req.params.id);
    },
  );

  app.put(
    `${base}/local`,
    { schema: { params: IdParams, body: LocalDocWriteBody, response: { 200: ContextDocContent } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.writeLocal(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    `${base}/local/upload`,
    {
      bodyLimit: UPLOAD_BODY_LIMIT_BYTES,
      schema: { params: IdParams, body: LocalDocUploadBody, response: { 200: LocalDocUploadResult } },
    },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.upload(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    `${base}/local/keep-copy`,
    { schema: { params: IdParams, body: KeepCopyBody, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      await service.keepCopy(workspaceId, req.params.id, req.body.path);
      return { ok: true as const };
    },
  );

  app.post(
    `${base}/local/folders`,
    { schema: { params: IdParams, body: LocalFolderBody, response: { 200: FolderResult } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      return service.createFolder(workspaceId, req.params.id, req.body.path);
    },
  );

  app.delete(
    `${base}/local`,
    { schema: { params: IdParams, querystring: PathQuery, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      await service.deleteLocal(workspaceId, req.params.id, req.query.path);
      return { ok: true as const };
    },
  );

  app.delete(
    `${base}/local/folders`,
    { schema: { params: IdParams, querystring: FolderQuery, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(c, req);
      await service.deleteFolder(workspaceId, req.params.id, req.query.path);
      return { ok: true as const };
    },
  );
}
