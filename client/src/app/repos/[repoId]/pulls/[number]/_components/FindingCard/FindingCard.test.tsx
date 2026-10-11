import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import contextDocs from "../../../../../../../../messages/en/contextDocs.json";
import { installFetch } from "../../../../../../../test/context-docs-fixtures";
import { FindingCard } from "./FindingCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  // The button reads "Reject"; the action it fires is still `dismiss` — the API
  // action name and the label deliberately differ.
  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Reject"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it('shows the "Outside PR scope" tag only when scope is "out"', () => {
    renderWithIntl(<FindingCard f={{ ...FINDING, scope: "out" }} defaultExpanded onAction={() => {}} />);
    expect(screen.getByText("Outside PR scope")).toBeInTheDocument();
    cleanup();

    renderWithIntl(<FindingCard f={{ ...FINDING, scope: "in" }} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByText("Outside PR scope")).not.toBeInTheDocument();
  });
});

describe("FindingCard — Turn into eval case (AC-60, AC-66)", () => {
  const BUTTON = { name: "Turn into eval case" };

  it("offers the button for decided findings of every kind, disabled for undecided ones", () => {
    for (const kind of ["finding", "secret_leak", "lethal_trifecta", "phantom", "hook"] as const) {
      renderWithIntl(
        <FindingCard f={{ ...FINDING, kind, dismissed_at: "2026-10-08T00:00:00Z" }} defaultExpanded onAction={() => {}} />,
      );
      expect(screen.getByRole("button", BUTTON)).toBeEnabled();
      cleanup();
    }
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.getByRole("button", BUTTON)).toBeDisabled();
  });

  it("has no Learn or Reply to author buttons", () => {
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={() => {}} />);
    expect(screen.queryByRole("button", { name: "Learn" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Reply to author" })).not.toBeInTheDocument();
  });
});

describe("FindingCard — cited project documents (AC-50)", () => {
  function renderCited(f: FindingRecord, repoId: string | null | undefined = "r1") {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return render(
      <QueryClientProvider client={client}>
        <NextIntlClientProvider locale="en" messages={{ prReview: messages, contextDocs }}>
          <FindingCard f={f} defaultExpanded onAction={() => {}} repoId={repoId} />
        </NextIntlClientProvider>
      </QueryClientProvider>,
    );
  }

  it("shows one chip per cited document, named by its path", () => {
    installFetch({});
    renderCited({ ...FINDING, cited_docs: ["docs/api.md", "specs/auth.md"] });
    expect(screen.getByText("Cited documents")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "docs/api.md" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "specs/auth.md" })).toBeInTheDocument();
  });

  it("opens the document preview when a chip is clicked, and closes it again", async () => {
    const net = installFetch({
      "GET /repos/r1/context-docs/content": (req) => ({
        path: new URLSearchParams(req.search).get("path"),
        source: "repo",
        content: "# API rules\n\nAlways paginate.",
        version: "v1",
        size_bytes: 30,
      }),
    });
    renderCited({ ...FINDING, cited_docs: ["docs/api.md"] });
    expect(net.requests).toHaveLength(0); // nothing is fetched until the chip is opened

    fireEvent.click(screen.getByRole("button", { name: "docs/api.md" }));
    expect(await screen.findByRole("heading", { name: "API rules" })).toBeInTheDocument();
    const req = net.requests[0]!;
    expect(req.path).toBe("/repos/r1/context-docs/content");
    expect(new URLSearchParams(req.search).get("path")).toBe("docs/api.md");

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("heading", { name: "API rules" })).not.toBeInTheDocument();
  });

  it("shows no chips for a finding without cited documents", () => {
    renderCited({ ...FINDING, cited_docs: [] });
    expect(screen.queryByText("Cited documents")).not.toBeInTheDocument();
    cleanup();
    renderCited(FINDING);
    expect(screen.queryByText("Cited documents")).not.toBeInTheDocument();
  });

  it("shows no chips when the repository is unknown (nothing to open them against)", () => {
    renderCited({ ...FINDING, cited_docs: ["docs/api.md"] }, null);
    expect(screen.queryByRole("button", { name: "docs/api.md" })).not.toBeInTheDocument();
  });

  it("renders a cited path as text, never as markup", () => {
    renderCited({ ...FINDING, cited_docs: ["<img src=x onerror=alert(1)>.md"] });
    expect(document.body.querySelector("img")).toBeNull();
    expect(within(document.body).getByRole("button", { name: "<img src=x onerror=alert(1)>.md" })).toBeInTheDocument();
  });
});

describe("FindingCard decision highlight", () => {
  const pressedOf = (f: FindingRecord) => {
    renderWithIntl(<FindingCard f={f} defaultExpanded onAction={() => {}} />);
    return {
      accept: screen.getByRole("button", { name: "Accept" }),
      reject: screen.getByRole("button", { name: "Reject" }),
    };
  };

  it("marks only Accept when accepted", () => {
    const { accept, reject } = pressedOf({ ...FINDING, accepted_at: "2026-10-08T00:00:00Z" });
    expect(accept).toHaveAttribute("data-decision", "accepted");
    expect(accept).toHaveAttribute("aria-pressed", "true");
    expect(reject).not.toHaveAttribute("data-decision");
    expect(reject).toHaveAttribute("aria-pressed", "false");
  });

  it("marks only Reject when dismissed", () => {
    const { accept, reject } = pressedOf({ ...FINDING, dismissed_at: "2026-10-08T00:00:00Z" });
    expect(reject).toHaveAttribute("data-decision", "dismissed");
    expect(reject).toHaveAttribute("aria-pressed", "true");
    expect(accept).not.toHaveAttribute("data-decision");
  });

  it("marks neither when undecided", () => {
    const { accept, reject } = pressedOf(FINDING);
    expect(accept).not.toHaveAttribute("data-decision");
    expect(reject).not.toHaveAttribute("data-decision");
  });
});
