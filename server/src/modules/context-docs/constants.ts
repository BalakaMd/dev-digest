/** Upload route body cap: up to 50 base64-encoded 64 KiB files fit with room to spare. */
export const UPLOAD_BODY_LIMIT_BYTES = 8 * 1024 * 1024;

/** Fixed, path-free messages (AC-5). */
export const SYNC_FAILED_MESSAGE = 'Could not sync the repository with GitHub';
export const NOT_CLONED_MESSAGE = 'Repository has no working copy yet';

/** Reason reported for an upload whose payload is not base64 (AC-70). */
export const INVALID_BASE64_REASON = 'file content is not valid base64';
