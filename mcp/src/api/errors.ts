/** Errors the API client raises. `tools/common.ts#toToolError` is the single
 * place that turns these into tool-facing text (never a stack trace). */

/** The API process could not be reached at all: DNS/connection/timeout. */
export class ApiUnreachableError extends Error {
  constructor(public readonly url: string, cause?: unknown) {
    super(`DevDigest API is not reachable at ${url}`);
    this.name = 'ApiUnreachableError';
    this.cause = cause;
  }
}

/** The API responded with a non-2xx status. `code`/`message` come from the
 * structured `ApiErrorBody` envelope when present. */
export class ApiHttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiHttpError';
  }
}

/** A response failed `safeParse` against its `@devdigest/shared` schema —
 * the MCP and server contracts have drifted. */
export class ApiContractError extends Error {
  constructor(
    public readonly route: string,
    public readonly issues: unknown,
  ) {
    super(`Unexpected response from DevDigest API for ${route}`);
    this.name = 'ApiContractError';
  }
}
