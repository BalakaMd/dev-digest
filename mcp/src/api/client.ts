import {
  Agent,
  Repo,
  PrMeta,
  PrDetail,
  SecretsStatus,
  ReviewRunResponse,
  RunSummary,
  ReviewRecord,
  ConventionsState,
  ApiErrorBody,
} from '@devdigest/shared';
import { z } from 'zod';
import { ApiUnreachableError, ApiHttpError, ApiContractError } from './errors.js';

/**
 * The ONLY module that calls `fetch`. Every response is `safeParse`d against
 * its `@devdigest/shared` schema before it leaves this file — a thin client
 * over the DevDigest API (Fastify on :3001), never Postgres, never a server
 * internal.
 */
export interface DevDigestApiOptions {
  baseUrl: string;
  /** Injected for tests; defaults to the global `fetch`. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export interface RequestOptions {
  signal?: AbortSignal;
}

export class DevDigestApi {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(opts: DevDigestApiOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, '');
    this.fetchImpl = opts.fetchImpl ?? fetch;
    this.timeoutMs = opts.timeoutMs ?? 10_000;
  }

  async listAgents(opts?: RequestOptions): Promise<Agent[]> {
    return this.request('GET', '/agents', z.array(Agent), undefined, opts);
  }

  async listRepos(opts?: RequestOptions): Promise<Repo[]> {
    return this.request('GET', '/repos', z.array(Repo), undefined, opts);
  }

  async lookupPull(repoId: string, number: number, opts?: RequestOptions): Promise<PrMeta | null> {
    try {
      return await this.request('GET', `/repos/${repoId}/pulls/${number}`, PrMeta, undefined, opts);
    } catch (err) {
      if (err instanceof ApiHttpError && err.status === 404) return null;
      throw err;
    }
  }

  /** One-time sync fallback used only by `run_review` (Q3) — never a read tool. */
  async syncPulls(repoId: string, opts?: RequestOptions): Promise<PrMeta[]> {
    return this.request('GET', `/repos/${repoId}/pulls`, z.array(PrMeta), undefined, opts);
  }

  /**
   * Resolve a PR by its own uuid (`GET /pulls/:id`), for the undocumented
   * bare-uuid `pr` input — the one case that skips repo resolution entirely.
   * `PrDetail` is a superset of `PrMeta`; callers use it as `PrMeta`.
   */
  async getPullById(id: string, opts?: RequestOptions): Promise<PrDetail | null> {
    try {
      return await this.request('GET', `/pulls/${id}`, PrDetail, undefined, opts);
    } catch (err) {
      if (err instanceof ApiHttpError && err.status === 404) return null;
      throw err;
    }
  }

  async secretsStatus(opts?: RequestOptions): Promise<SecretsStatus> {
    return this.request('GET', '/settings/secrets-status', SecretsStatus, undefined, opts);
  }

  async startReview(
    prId: string,
    body: { agentId?: string; all?: boolean },
    opts?: RequestOptions,
  ): Promise<ReviewRunResponse> {
    return this.request('POST', `/pulls/${prId}/review`, ReviewRunResponse, body, opts);
  }

  async listRuns(prId: string, opts?: RequestOptions): Promise<RunSummary[]> {
    return this.request('GET', `/pulls/${prId}/runs`, z.array(RunSummary), undefined, opts);
  }

  async listReviews(prId: string, opts?: RequestOptions): Promise<ReviewRecord[]> {
    return this.request('GET', `/pulls/${prId}/reviews`, z.array(ReviewRecord), undefined, opts);
  }

  async getConventions(repoId: string, opts?: RequestOptions): Promise<ConventionsState> {
    return this.request('GET', `/repos/${repoId}/conventions`, ConventionsState, undefined, opts);
  }

  private async request<T>(
    method: 'GET' | 'POST',
    path: string,
    schema: z.ZodType<T, z.ZodTypeDef, unknown>,
    body: unknown,
    opts?: RequestOptions,
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const signal = opts?.signal ? AbortSignal.any([timeoutSignal, opts.signal]) : timeoutSignal;

    let res: Response;
    try {
      res = await this.fetchImpl(url, {
        method,
        signal,
        ...(body !== undefined
          ? { headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
          : {}),
      });
    } catch (err) {
      throw new ApiUnreachableError(this.baseUrl, err);
    }

    if (res.status === 429) {
      const retryAfter = res.headers.get('retry-after');
      throw new ApiHttpError(429, 'rate_limited', 'Rate limited', { retryAfter });
    }

    if (!res.ok) {
      let code = 'unknown_error';
      let message = `DevDigest API returned ${res.status}`;
      let details: unknown;
      try {
        const json = (await res.json()) as unknown;
        const parsed = ApiErrorBody.safeParse(json);
        if (parsed.success) {
          code = parsed.data.error.code;
          message = parsed.data.error.message;
          details = parsed.data.error.details;
        }
      } catch {
        // non-JSON error body — keep the generic message.
      }
      throw new ApiHttpError(res.status, code, message, details);
    }

    const json = (await res.json()) as unknown;
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ApiContractError(`${method} ${path}`, parsed.error.issues);
    }
    return parsed.data;
  }
}
