import type { AgentCase } from "../../src/index.js";
import { cases as strictCases } from "../architecture-reviewer/architecture-reviewer.cases.js";

/**
 * The lite variant is the SAME agent with one requirement removed: "every finding cites the rule
 * and its source". So it is graded on the strict variant's exact tasks (same prompts, same
 * fixtures) MINUS the citation practices — which lite is designed not to satisfy. Asserting them
 * would contradict the artifact under test (Haiku fails them too, by design), not measure a defect.
 *
 * Everything else stays: both variants must still FIND the violations, quote them verbatim, assign
 * severity, and stay out of fabricated findings. What moves between the two runs is only the citation, which
 * is exactly the A/B this pair exists to expose — run `pnpm eval:delta` on the two labeled repeats.
 */
const CITATION_PRACTICE = /names the (?:specific|exact) documented rule/i;

export const cases: AgentCase[] = strictCases.map((c) => {
  const practices = c.practices?.filter((p) => !CITATION_PRACTICE.test(p));
  // Rename the reviewer-core case: without the citation practices it no longer tests "cites the
  // identifier" — it tests that lite still finds both reviewer-core violations with evidence.
  const name =
    c.name === "cites the documented reviewer-core invariants for both violations"
      ? "flags both reviewer-core violations with verbatim evidence (no citation required)"
      : c.name;
  return { ...c, name, practices };
});
