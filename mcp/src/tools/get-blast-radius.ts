import { PrInput, ok } from './common.js';
import { TOOL_NAMES } from '../constants.js';

const NOT_IMPLEMENTED_TEXT =
  'devdigest_get_blast_radius is not implemented yet (planned for a later lesson). For now use devdigest_get_findings or read the diff.';

/** Stub only — the final contract, so the later lesson does not change the
 * schema (§ Tool contracts). No API call. */
export function registerGetBlastRadius() {
  return {
    name: TOOL_NAMES.getBlastRadius,
    config: {
      title: 'Blast radius of a PR (not implemented yet)',
      description: 'Blast radius of a PR (impacted symbols and callers). Not implemented yet — returns a not-implemented notice.',
      inputSchema: { pr: PrInput },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    handler: async (_args: { pr: string }) => ok(NOT_IMPLEMENTED_TEXT),
  };
}
