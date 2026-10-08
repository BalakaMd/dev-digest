import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

// The panel seeds its severity filter from ?severity=…; each test picks the
// query string the page would have been opened with.
let searchParams = new URLSearchParams();
vi.mock("next/navigation", () => ({
  useSearchParams: () => searchParams,
}));

import { FindingsPanel } from "./FindingsPanel";
import { installFetch } from "../../../../../../../test/context-docs-fixtures";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  searchParams = new URLSearchParams();
});

function finding(o: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

const FINDINGS: FindingRecord[] = [finding()];

/** Two criticals, one warning — enough to tell counts and filtering apart. */
const MIXED: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret" }),
  finding({ id: "f2", severity: "CRITICAL", title: "SSRF in webhook forwarder" }),
  finding({ id: "f3", severity: "WARNING", title: "N+1 query in user list" }),
];

function renderWithIntl(ui: React.ReactElement) {
  // FindingCard's "Turn into eval case" button uses a mutation hook → needs a QueryClient.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });

  it("renders no counters and no filters for a run without findings", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.queryByRole("group", { name: "Findings by severity" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Filter findings by severity" }),
    ).not.toBeInTheDocument();
  });
});

describe("FindingsPanel severity counters", () => {
  it("counts each severity present and omits the ones with no findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const counters = screen.getByRole("group", { name: "Findings by severity" });
    expect(counters.textContent).toBe("2 CRITICAL1 WARNING");
  });

  it("every counter matches the number of finding cards listed below it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // 2 CRITICAL ⇒ two critical titles rendered, 1 WARNING ⇒ one warning title.
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SSRF in webhook forwarder")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity filter", () => {
  it("keeps only the clicked severity, and restores everything on a second click", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const critical = screen.getByRole("button", { name: /Critical/ });

    fireEvent.click(critical);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("SSRF in webhook forwarder")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query in user list")).not.toBeInTheDocument();
    expect(critical).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(critical);
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
    expect(critical).toHaveAttribute("aria-pressed", "false");
  });

  it("switching to another severity replaces the filter rather than stacking it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    fireEvent.click(screen.getByRole("button", { name: /Warning/ }));
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("counters keep showing the run's totals while a filter is applied", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /Warning/ }));
    expect(screen.getByRole("group", { name: "Findings by severity" }).textContent).toBe(
      "2 CRITICAL1 WARNING",
    );
  });

  it("offers all three filters even when a severity has no findings", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    const filters = screen.getByRole("group", { name: "Filter findings by severity" });
    expect(filters.textContent).toBe("CriticalWarningSuggestion");
  });

  it("pre-applies the severity from the URL (the PR list's chips deep-link here)", () => {
    searchParams = new URLSearchParams("severity=WARNING");
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
  });

  it("ignores an unknown severity in the URL", () => {
    searchParams = new URLSearchParams("severity=NONSENSE");
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query in user list")).toBeInTheDocument();
  });
});

describe("FindingsPanel eval-case lookup (AC-2)", () => {
  it("disables 'Turn into eval case' only for the finding that already has a case", async () => {
    installFetch({
      "GET /agents/a1/eval-cases": [{ id: "c1", name: "stripe-key", source_finding_id: "f1" }],
    });
    const decided = "2026-10-08T00:00:00Z";
    renderWithIntl(
      <FindingsPanel
        agentId="a1"
        prId="pr1"
        findings={[
          finding({ id: "f1", title: "Hardcoded secret", accepted_at: decided }),
          finding({ id: "f2", title: "SSRF in webhook forwarder", dismissed_at: decided }),
        ]}
      />,
    );
    fireEvent.click(screen.getByText("SSRF in webhook forwarder"));
    const buttons = screen.getAllByRole("button", { name: "Turn into eval case" });
    expect(buttons).toHaveLength(2);
    await waitFor(() => expect(buttons[0]).toBeDisabled());
    expect(buttons[1]).toBeEnabled();
  });
});
