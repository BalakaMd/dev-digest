/* Test fixtures for project context documents: list/entry builders and a tiny
   fetch router, shared by the picker, the editor tabs and the Project Context
   page tests. Not a test file (no `.test.` suffix) — vitest does not collect it. */
import { vi } from "vitest";
import type { ContextDocEntry, ContextDocList, ContextDocUsage } from "@devdigest/shared";

export function entry(path: string, over: Partial<ContextDocEntry> = {}): ContextDocEntry {
  const slash = path.lastIndexOf("/");
  const folder = slash < 0 ? "" : path.slice(0, slash);
  const typeSeg = folder.split("/").reverse().find((s) => s === "specs" || s === "docs" || s === "insights");
  return {
    path,
    source: "repo",
    type: (typeSeg as ContextDocEntry["type"]) ?? null,
    folder,
    size_bytes: 1200,
    tokens: 100,
    too_large: false,
    overrides_repo: false,
    overridden: false,
    repo_changed: false,
    ...over,
  };
}

export function listOf(docs: ContextDocEntry[], over: Partial<ContextDocList> = {}): ContextDocList {
  return {
    state: "ok",
    docs,
    local_folders: [],
    truncated: false,
    search_globs: ["**/{specs,docs,insights}/**/*.md"],
    limits: { max_doc_bytes: 65_536, max_attachments: 20, token_budget: 8_000 },
    scanned_at: new Date().toISOString(),
    ...over,
  };
}

export function usageOf(over: Partial<ContextDocUsage> = {}): ContextDocUsage {
  return {
    attached_by_agents: [],
    attached_by_skills: [],
    used_by_agents: 0,
    enabled_agents: 2,
    coverage_pct: 0,
    ...over,
  };
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export const apiError = (status: number, message: string, details?: unknown, code = "error") =>
  json({ error: { code, message, details } }, status);

export interface RecordedRequest {
  method: string;
  path: string;
  search: string;
  body: unknown;
}

/**
 * Installs a `fetch` mock that routes by "METHOD /path" (query string ignored).
 * A handler may be a value (200 JSON), a Response, or a function returning
 * either. Unrouted requests fail the test loudly.
 */
// (`unknown` is deliberately not in the union: it would swallow the function member
// and leave handler parameters implicitly `any`.)
export type Handler =
  | string
  | number
  | boolean
  | null
  | object
  | Response
  | ((req: RecordedRequest) => unknown | Promise<unknown>);

export function installFetch(routes: Record<string, Handler>) {
  const requests: RecordedRequest[] = [];
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const u = new URL(String(url));
    const method = (init?.method ?? "GET").toUpperCase();
    const req: RecordedRequest = {
      method,
      path: u.pathname,
      search: u.search,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };
    requests.push(req);
    const handler = routes[`${method} ${u.pathname}`];
    if (handler === undefined) throw new Error(`unrouted request: ${method} ${u.pathname}${u.search}`);
    const out = typeof handler === "function" ? await (handler as (r: RecordedRequest) => unknown)(req) : handler;
    return out instanceof Response ? out : json(out);
  });
  vi.stubGlobal("fetch", fetchMock);
  return { fetchMock, requests, count: (method: string, path: string) => requests.filter((r) => r.method === method && r.path === path).length };
}
