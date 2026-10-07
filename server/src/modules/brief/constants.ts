/** Constants for the brief module (SPEC-04, PR Brief). */
import type { TourLanguage } from '@devdigest/shared';

export const BRIEF_PROMPT = 'brief.system.md';
export const BRIEF_SCHEMA_NAME = 'PrBriefAnswer';
export const BRIEF_TEMPERATURE = 0.2;
export const BRIEF_MAX_TOKENS = 3000;
export const BRIEF_TIMEOUT_MS = 120_000;

/** AC-25: system message + user message, counted by the server tokenizer. */
export const BRIEF_INPUT_BUDGET_TOKENS = 8000;
/** AC-44 caps, applied after grounding. */
export const MAX_RISKS = 5;
export const MAX_REVIEW_FOCUS = 5;
/** AC-23: linked issue title + body cut to this many bytes before it enters the budget. */
export const MAX_ISSUE_BYTES = 20_000;
/** Safety cap on one hunk header line (the text after the second `@@`). */
export const MAX_HUNK_HEADER_CHARS = 300;
export const MAX_ERROR_CHARS = 300;

export const DEFAULT_TOUR_LANGUAGE: TourLanguage = 'English';
/** Duplicated on purpose from `onboarding/constants.ts` (modules do not import each other). */
export const TOUR_LANGUAGE_KEY = 'tour_language';

/**
 * Display order of the per-file list in the prompt. Local twin of
 * `reviews/smart-diff/constants.ts#SMART_DIFF_ROLE_ORDER` (modules do not
 * import each other); the `satisfies` keeps it a valid role list.
 */
export const FILE_ROLE_ORDER = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const satisfies readonly import('@devdigest/shared').SmartDiffRole[];
