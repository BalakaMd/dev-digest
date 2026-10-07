import type { AgentCase } from "../../src/index.js";
import { fixtureReader } from "../../src/index.js";

const fx = fixtureReader(import.meta.url);

// The agent normally derives its scope from `git diff <base>`. In an eval the change is NOT in the
// working tree and Bash is stripped (see agentTools), so the prompt hands it the scope explicitly —
// the agent's own Step 0 says "use the base the caller gives". Everything else (finding the rules
// in CLAUDE.md / AGENTS.md / the onion-architecture skill) it still does itself with Read/Grep/Glob.
const audit = (diff: string) => `Audit this change against the architecture rules this repository documents about itself.

The change is NOT applied to the working tree and there is no git base to compute — the scope is
exactly the diff below; treat its files as the changed files. Read the repo's guidance and
architecture skills from disk to find the rules, then review the diff.

${fx(diff)}`;

// A new server module whose service imports a Fastify type and constructs its own repository —
// two textbook ring violations under the onion-architecture skill.
const CHECKOUT_PROMPT = audit("checkout-service.diff");

// A change to reviewer-core whose violations map onto DevDigest-SPECIFIC invariants (the
// reviewer-core/CLAUDE.md "No I/O" and "Grounding is mandatory" rules) that a competent model will
// describe in prose but will not reliably attribute to their documented source unless the agent
// forces it. This is the discriminating case for the strict-vs-lite A/B.
const REVIEWER_CORE_PROMPT = audit("reviewer-core-gate.diff");

// A diff that violates NO documented rule (a local-parameter rename, no new imports, no cross-ring
// edges). A grounded reviewer reports zero findings. This surfaces the COST of relaxing the
// citation rule: the lite variant is more prone to fabricating a best-practice finding.
const BENIGN_PROMPT = audit("benign-refactor.diff");

// Shared across the strict (architecture-reviewer) and relaxed (architecture-reviewer-lite)
// variants so the two agents are graded on the exact same task — the only thing that should move
// between the two runs is whether the "names the specific documented rule" practices keep passing.
// Keep that wording: architecture-reviewer-lite.cases.ts filters those practices by regex.
export const cases: AgentCase[] = [
  {
    name: "flags both violations in the checkout diff with severity and a cited rule",
    kind: "quality",
    prompt: CHECKOUT_PROMPT,
    practices: [
      "flags `import type { FastifyReply } from 'fastify'` in server/src/modules/checkout/service.ts as a layering violation (a service must not depend on Fastify / transport types)",
      "flags `new CheckoutRepository()` inside service.ts as a violation (only the composition root, platform/container.ts, may construct concrete classes; dependencies are injected through the constructor, not fetched)",
      "names the specific documented rule it breaks AND the source document of that rule (e.g. the onion-architecture skill or server guidance) for EVERY finding, rather than describing the problem only in prose",
      "assigns each finding a severity tier (Critical, Major or Minor)",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "gives a fix direction for each finding in prose without writing a code patch",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate an architecture finding for the out-of-scope parameter",
    kind: "quality",
    prompt: CHECKOUT_PROMPT,
    practices: [
      "does not raise a runtime-bug, null-safety or security finding about the optional `reply?: FastifyReply` parameter — citing it as part of the same Fastify-type layering violation is correct and expected, not a fabrication",
      "stays scoped to architecture (dependency direction, ring placement, dependency injection) and gives no verdict on naming, style, performance or test coverage",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
  {
    name: "cites the documented reviewer-core invariants for both violations",
    kind: "quality",
    prompt: REVIEWER_CORE_PROMPT,
    practices: [
      "flags the `import { readFileSync } from 'node:fs'` added to reviewer-core/src/review/run.ts (and the file read it enables) as a violation of reviewer-core's no-I/O invariant",
      "flags that the `groundFindings()` call was removed and findings are now passed through ungrounded as a violation of the mandatory grounding gate",
      "names the specific documented rule for the fs-import finding and its source (the 'No I/O' invariant in reviewer-core/CLAUDE.md, AGENTS.md or docs/pipeline.md) rather than only describing it in prose",
      "names the specific documented rule for the removed-gate finding and its source (the 'Grounding is mandatory' invariant in reviewer-core/CLAUDE.md or AGENTS.md) rather than only describing it in prose",
      "quotes the offending line verbatim as evidence for each finding, not a paraphrase",
      "rates at least one of the two findings Critical and gives a concrete failure scenario for it (e.g. ungrounded findings reaching the review, or the pure engine failing without a filesystem)",
    ],
    threshold: 0.8,
    maxTurns: 25,
  },
  {
    name: "does not fabricate a documented-rule violation for a benign rename",
    kind: "quality",
    prompt: BENIGN_PROMPT,
    practices: [
      "reports no Critical or Major finding for the parameter rename (at most Minor or 'Observations (no written rule)')",
      "does not fabricate a documented-rule violation where the diff violates none of the documented rules",
      "states explicitly that the review found no findings / no violations",
    ],
    threshold: 1.0,
    maxTurns: 25,
  },
];
