import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../messages/en/intent.json";

let queryData: { intent: PrIntentRecord | null } | undefined;
let queryLoading = false;
let queryErrored = false;
const refetch = vi.fn();

const derive = vi.fn();
let deriving = false;
let deriveErrored = false;

vi.mock("@/lib/hooks/intent", () => ({
  usePrIntent: () => ({
    data: queryData,
    isLoading: queryLoading,
    isError: queryErrored,
    error: queryErrored ? new ApiError("cannot load", 500) : null,
    refetch,
  }),
  useDeriveIntent: () => ({
    mutate: derive,
    isPending: deriving,
    isError: deriveErrored,
    error: deriveErrored ? new ApiError("derive failed", 502) : null,
  }),
}));

import { IntentCard } from "./IntentCard";

function renderCard() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ intent: messages }}>
      <IntentCard prId="pr1" />
    </NextIntlClientProvider>,
  );
}

const RECORD: PrIntentRecord = {
  summary: "Add pagination to the pull-request list endpoint.",
  in_scope: ["Cursor-based pagination on GET /pulls", "A `next_cursor` field in the response"],
  out_of_scope: ["Changing the list's sort order"],
  pr_id: "pr1",
  confidence: "high",
  sources: [
    { kind: "description", ref: "pr-description", status: "used", bytes: 420, detail: null },
    { kind: "plan", ref: "docs/plan.md", status: "unreachable", bytes: null, detail: "404" },
  ],
  head_sha: "abc123",
  stale: false,
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 900,
  tokens_out: 120,
  cost_usd: 0.0006,
  derived_at: new Date().toISOString(),
};

beforeEach(() => {
  queryData = undefined;
  queryLoading = false;
  queryErrored = false;
  deriving = false;
  deriveErrored = false;
  derive.mockReset();
  refetch.mockReset();
});
afterEach(cleanup);

describe("IntentCard", () => {
  it("shows a loading skeleton while the intent query is pending", () => {
    queryLoading = true;
    renderCard();
    expect(screen.getByText("Intent")).toBeInTheDocument();
  });

  it("offers Derive intent when none exists, and calls the mutation on click", () => {
    queryData = { intent: null };
    renderCard();
    expect(screen.getByText("No intent derived yet for this PR.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Derive intent" }));
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("renders the quoted summary, both scope columns, confidence and unavailable sources", () => {
    queryData = { intent: RECORD };
    renderCard();
    expect(screen.getByText(/Add pagination to the pull-request list endpoint\./)).toBeInTheDocument();
    expect(screen.getByText("Cursor-based pagination on GET /pulls")).toBeInTheDocument();
    expect(screen.getByText("Changing the list's sort order")).toBeInTheDocument();
    expect(screen.getByText("Confidence: High")).toBeInTheDocument();
    // the unreachable plan doc is shown, with a notice that context is missing
    expect(screen.getByText(/docs\/plan\.md/)).toBeInTheDocument();
    expect(screen.getByText(/unreachable/)).toBeInTheDocument();
    expect(
      screen.getByText("Some referenced context could not be read — the intent may be incomplete."),
    ).toBeInTheDocument();
  });

  it("shows a stale warning with an emphasised Re-derive button, and triggers re-derivation", () => {
    queryData = { intent: { ...RECORD, stale: true } };
    renderCard();
    expect(screen.getByText("PR changed since this intent was derived.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Re-derive" }));
    expect(derive).toHaveBeenCalledTimes(1);
  });

  it("shows an inline message and Retry when the query fails", () => {
    queryErrored = true;
    renderCard();
    expect(screen.getByText("cannot load")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("shows an inline message when the derive mutation fails", () => {
    queryData = { intent: null };
    deriveErrored = true;
    renderCard();
    expect(screen.getByText("derive failed")).toBeInTheDocument();
  });

  it("renders every source kind and status with its translated label, marking unavailable ones", () => {
    queryData = {
      intent: {
        ...RECORD,
        sources: [
          { kind: "title", ref: "pr-title", status: "used", bytes: 40, detail: null },
          { kind: "description", ref: "pr-description", status: "truncated", bytes: 8000, detail: null },
          { kind: "files", ref: "files", status: "unreachable", bytes: null, detail: "timeout" },
          { kind: "issue", ref: "acme/api#12", status: "unsupported", bytes: null, detail: null },
          { kind: "plan", ref: "docs/plan.md", status: "skipped", bytes: null, detail: "over budget" },
          { kind: "spec", ref: "docs/spec.md", status: "used", bytes: 500, detail: null },
          { kind: "link", ref: "acme.atlassian.net/browse/X-1", status: "used", bytes: null, detail: null },
        ],
      },
    };
    renderCard();

    // every source kind is translated
    expect(screen.getByText(/PR title/)).toBeInTheDocument();
    expect(screen.getByText(/PR description/)).toBeInTheDocument();
    expect(screen.getByText(/Changed files/)).toBeInTheDocument();
    expect(screen.getByText(/Linked issue/)).toBeInTheDocument();
    expect(screen.getByText(/Plan doc/)).toBeInTheDocument();
    expect(screen.getByText(/Spec doc/)).toBeInTheDocument();
    expect(screen.getByText(/Link ·/)).toBeInTheDocument();

    // every status is translated
    expect(screen.getAllByText(/used$/).length).toBeGreaterThanOrEqual(3);
    expect(screen.getByText(/truncated$/)).toBeInTheDocument();
    expect(screen.getByText(/unreachable$/)).toBeInTheDocument();
    expect(screen.getByText(/unsupported$/)).toBeInTheDocument();
    expect(screen.getByText(/skipped$/)).toBeInTheDocument();

    // the unavailable ones (unreachable/unsupported/skipped) are called out
    expect(
      screen.getByText("Some referenced context could not be read — the intent may be incomplete."),
    ).toBeInTheDocument();
  });

  it("shows Low confidence when the intent was derived from indirect data only", () => {
    queryData = { intent: { ...RECORD, confidence: "low" } };
    renderCard();
    expect(screen.getByText("Confidence: Low")).toBeInTheDocument();
  });

  it("does not warn about missing context when every source was actually used", () => {
    queryData = {
      intent: {
        ...RECORD,
        sources: [{ kind: "title", ref: "pr-title", status: "used", bytes: 40, detail: null }],
      },
    };
    renderCard();
    expect(
      screen.queryByText("Some referenced context could not be read — the intent may be incomplete."),
    ).not.toBeInTheDocument();
  });

  it("shows the emptyList text in both columns when the classifier found nothing in or out of scope", () => {
    queryData = { intent: { ...RECORD, in_scope: [], out_of_scope: [] } };
    renderCard();
    expect(screen.getAllByText("None derived.")).toHaveLength(2);
  });

  it("disables the re-derive button and shows Deriving… while a derivation is in flight", () => {
    queryData = { intent: RECORD };
    deriving = true;
    renderCard();
    const button = screen.getByRole("button", { name: "Deriving…" });
    expect(button).toBeDisabled();
  });
});
