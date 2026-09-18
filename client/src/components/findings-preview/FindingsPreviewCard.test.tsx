/**
 * The preview card is the READ-ONLY face of a finding: it is shown on hover from
 * the PR list and must never offer an action, because acting on a finding needs
 * the expanded run accordion on the PR detail page. The no-button assertion is
 * the point of this suite — the rest guards the fields the card promises.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsPreviewCard, sortBySeverity } from "./FindingsPreviewCard";

afterEach(cleanup);

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    review_id: "r1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded Stripe secret key in commit",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "Line 12 contains a literal string starting with sk_live_.",
    suggestion: null,
    confidence: 0.98,
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

describe("FindingsPreviewCard", () => {
  it("shows the title, the finding and its location", () => {
    render(
      <FindingsPreviewCard findings={[finding()]} title="1 findings in this run" top={0} left={0} />,
    );
    expect(screen.getByText("1 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded Stripe secret key in commit")).toBeInTheDocument();
    expect(screen.getByText("src/config.ts:12")).toBeInTheDocument();
    expect(screen.getByText("98% conf")).toBeInTheDocument();
  });

  it("offers no actions — accepting or rejecting happens on the PR detail page", () => {
    render(
      <FindingsPreviewCard
        findings={[finding(), finding({ id: "f2", severity: "WARNING" })]}
        title="2 findings in this run"
        top={0}
        left={0}
      />,
    );
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

describe("sortBySeverity", () => {
  it("orders CRITICAL → WARNING → SUGGESTION and leaves unknown severities last", () => {
    const sorted = sortBySeverity([
      finding({ id: "a", severity: "SUGGESTION" }),
      finding({ id: "b", severity: "INFO" as FindingRecord["severity"] }),
      finding({ id: "c", severity: "CRITICAL" }),
      finding({ id: "d", severity: "WARNING" }),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["c", "d", "a", "b"]);
  });
});
