/**
 * Public entry for the Smart Diff classifier — the only import path other
 * code (the service now, the later pre-prompt filter later) should use.
 * Named exports only.
 */
export { classifyFile } from './classify.js';
export { buildSmartDiff, selectLatestReviews } from './build.js';
export { SMART_DIFF_ROLE_ORDER, SMART_DIFF_RULES } from './constants.js';
